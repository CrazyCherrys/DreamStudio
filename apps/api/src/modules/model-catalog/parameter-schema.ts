import type { Prisma } from '@prisma/client';

export const PARAMETER_FIELD_TYPES = ['string', 'number', 'integer', 'boolean', 'select'] as const;

export type ParameterFieldType = (typeof PARAMETER_FIELD_TYPES)[number];

export interface ParameterSchemaOption {
  label: string;
  value: string | number | boolean;
}

export interface ParameterSchemaField {
  key: string;
  label: string;
  type: ParameterFieldType;
  description?: string;
  required: boolean;
  default?: string | number | boolean | null;
  min?: number;
  max?: number;
  options?: ParameterSchemaOption[];
  placeholder?: string;
  ui?: {
    group?: string;
    slot?: string;
    order?: number;
  };
  capability?: string;
  send_policy?: string;
  validation?: Prisma.InputJsonObject;
  help_url?: string;
}

export interface ParameterValidationResult {
  ok: boolean;
  errors: Array<{ field: string; message: string }>;
  value: Record<string, string | number | boolean | null>;
}

type JsonObject = Record<string, unknown>;

const KEY_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const MAX_SCHEMA_FIELDS = 80;
const MAX_SELECT_OPTIONS = 200;

export function normalizeParameterSchema(rawSchema: unknown): ParameterSchemaField[] {
  const errors: Array<{ field: string; message: string }> = [];
  const schema = parseParameterSchema(rawSchema, errors);

  if (errors.length > 0) {
    throwParameterSchemaError(errors);
  }

  return schema;
}

export function assertDefaultParams(
  schema: ParameterSchemaField[],
  rawParams: unknown,
): Prisma.InputJsonObject {
  const params = normalizePlainObject(rawParams, 'default_params');
  const result = validateParameters(schema, params, {
    requireRequiredFields: false,
  });

  if (!result.ok) {
    throwParameterSchemaError(
      result.errors.map((error) => ({
        field: `default_params.${error.field}`,
        message: error.message,
      })),
    );
  }

  return result.value as Prisma.InputJsonObject;
}

export function validateParameters(
  schema: ParameterSchemaField[],
  rawParams: unknown,
  options: { requireRequiredFields?: boolean } = {},
): ParameterValidationResult {
  const params = normalizePlainObject(rawParams, 'params');
  const errors: Array<{ field: string; message: string }> = [];
  const allowedKeys = new Set(schema.map((field) => field.key));
  const value: Record<string, string | number | boolean | null> = {};

  for (const key of Object.keys(params)) {
    if (!allowedKeys.has(key)) {
      errors.push({
        field: key,
        message: '参数未在 parameter_schema 中声明',
      });
    }
  }

  for (const field of schema) {
    const hasValue = Object.prototype.hasOwnProperty.call(params, field.key);
    const rawValue = hasValue ? params[field.key] : field.default;

    if (!hasValue && rawValue === undefined) {
      if (options.requireRequiredFields && field.required) {
        errors.push({
          field: field.key,
          message: '必填参数不能为空',
        });
      }
      continue;
    }

    const typedValue = coerceAndValidateFieldValue(field, rawValue, errors);
    if (typedValue !== undefined) {
      value[field.key] = typedValue;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value,
  };
}

export function parameterSchemaToJson(schema: ParameterSchemaField[]): Prisma.InputJsonArray {
  return schema.map((field) => {
    const jsonField: Record<string, Prisma.InputJsonValue> = {
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
    };

    for (const key of [
      'description',
      'default',
      'min',
      'max',
      'options',
      'placeholder',
      'ui',
      'capability',
      'send_policy',
      'validation',
      'help_url',
    ] as const) {
      if (field[key] !== undefined) {
        jsonField[key] = field[key] as Prisma.InputJsonValue;
      }
    }

    return jsonField;
  }) as Prisma.InputJsonArray;
}

function parseParameterSchema(
  rawSchema: unknown,
  errors: Array<{ field: string; message: string }>,
): ParameterSchemaField[] {
  if (!Array.isArray(rawSchema)) {
    errors.push({
      field: 'parameter_schema',
      message: 'parameter_schema 必须是数组',
    });
    return [];
  }

  if (rawSchema.length > MAX_SCHEMA_FIELDS) {
    errors.push({
      field: 'parameter_schema',
      message: `字段数量不能超过 ${MAX_SCHEMA_FIELDS}`,
    });
  }

  const seenKeys = new Set<string>();
  return rawSchema
    .map((item, index) => parseField(item, index, errors))
    .filter((field): field is ParameterSchemaField => {
      if (!field) {
        return false;
      }

      if (seenKeys.has(field.key)) {
        errors.push({
          field: `parameter_schema.${field.key}`,
          message: 'key 不能重复',
        });
        return false;
      }

      seenKeys.add(field.key);
      return true;
    });
}

function parseField(
  item: unknown,
  index: number,
  errors: Array<{ field: string; message: string }>,
): ParameterSchemaField | null {
  const path = `parameter_schema[${index}]`;
  if (!isObject(item)) {
    errors.push({
      field: path,
      message: '字段必须是对象',
    });
    return null;
  }

  const key = readTrimmedString(item.key);
  const label = readTrimmedString(item.label);
  const type = readTrimmedString(item.type);
  const required = item.required === undefined ? false : item.required;

  if (!key || !KEY_PATTERN.test(key)) {
    errors.push({
      field: `${path}.key`,
      message: 'key 只允许 1-80 位字母、数字、下划线或短横线',
    });
  }

  if (!label) {
    errors.push({
      field: `${path}.label`,
      message: 'label 不能为空',
    });
  }

  if (!isParameterFieldType(type)) {
    errors.push({
      field: `${path}.type`,
      message: 'type 不受支持',
    });
  }

  if (typeof required !== 'boolean') {
    errors.push({
      field: `${path}.required`,
      message: 'required 必须是布尔值',
    });
  }

  const field: ParameterSchemaField = {
    key,
    label,
    type: isParameterFieldType(type) ? type : 'string',
    required: typeof required === 'boolean' ? required : false,
  };

  const description = readOptionalTrimmedString(item.description);
  if (description !== undefined) {
    field.description = description;
  }

  const placeholder = readOptionalTrimmedString(item.placeholder);
  if (placeholder !== undefined) {
    field.placeholder = placeholder;
  }

  const ui = parseFieldUi(item.ui, path, errors);
  if (ui !== undefined) {
    field.ui = ui;
  }

  const capability = readOptionalTrimmedString(item.capability);
  if (capability !== undefined) {
    field.capability = capability;
  }

  const sendPolicy = readOptionalTrimmedString(item.send_policy);
  if (sendPolicy !== undefined) {
    field.send_policy = sendPolicy;
  }

  const validation = parseOptionalJsonObject(item.validation, `${path}.validation`, errors);
  if (validation !== undefined) {
    field.validation = validation;
  }

  const helpUrl = readOptionalTrimmedString(item.help_url);
  if (helpUrl !== undefined) {
    field.help_url = helpUrl;
  }

  if (item.min !== undefined) {
    const min = readFiniteNumber(item.min, `${path}.min`, errors);
    if (min !== null) {
      field.min = min;
    }
  }

  if (item.max !== undefined) {
    const max = readFiniteNumber(item.max, `${path}.max`, errors);
    if (max !== null) {
      field.max = max;
    }
  }

  if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
    errors.push({
      field: `${path}.min`,
      message: 'min 不能大于 max',
    });
  }

  if (item.options !== undefined) {
    field.options = parseOptions(item.options, path, errors);
  }

  if (field.type === 'select' && (!field.options || field.options.length === 0)) {
    errors.push({
      field: `${path}.options`,
      message: 'select 必须配置 options',
    });
  }

  if (field.type !== 'select' && field.options) {
    errors.push({
      field: `${path}.options`,
      message: '只有 select 支持 options',
    });
  }

  if (
    (field.type === 'string' || field.type === 'boolean') &&
    (field.min !== undefined || field.max !== undefined)
  ) {
    errors.push({
      field: `${path}.min`,
      message: '只有 number 和 integer 支持 min/max',
    });
  }

  if (item.default !== undefined) {
    const defaultErrorsLength = errors.length;
    const defaultValue = coerceAndValidateFieldValue(
      field,
      item.default,
      errors,
      `${path}.default`,
    );
    if (errors.length === defaultErrorsLength && defaultValue !== undefined) {
      field.default = defaultValue;
    }
  }

  return field;
}

function parseFieldUi(
  rawUi: unknown,
  path: string,
  errors: Array<{ field: string; message: string }>,
): ParameterSchemaField['ui'] | undefined {
  if (rawUi === undefined || rawUi === null) {
    return undefined;
  }
  if (!isObject(rawUi)) {
    errors.push({
      field: `${path}.ui`,
      message: 'ui 必须是对象',
    });
    return undefined;
  }

  const ui: NonNullable<ParameterSchemaField['ui']> = {};
  const group = readOptionalTrimmedString(rawUi.group);
  const slot = readOptionalTrimmedString(rawUi.slot);
  if (group !== undefined) {
    ui.group = group;
  }
  if (slot !== undefined) {
    ui.slot = slot;
  }
  if (rawUi.order !== undefined) {
    const order = readFiniteNumber(rawUi.order, `${path}.ui.order`, errors);
    if (order !== null) {
      ui.order = order;
    }
  }

  return Object.keys(ui).length > 0 ? ui : undefined;
}

function parseOptionalJsonObject(
  rawValue: unknown,
  field: string,
  errors: Array<{ field: string; message: string }>,
): Prisma.InputJsonObject | undefined {
  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }
  if (!isObject(rawValue)) {
    errors.push({
      field,
      message: '必须是对象',
    });
    return undefined;
  }
  return rawValue as Prisma.InputJsonObject;
}

function parseOptions(
  rawOptions: unknown,
  path: string,
  errors: Array<{ field: string; message: string }>,
): ParameterSchemaOption[] {
  if (!Array.isArray(rawOptions)) {
    errors.push({
      field: `${path}.options`,
      message: 'options 必须是数组',
    });
    return [];
  }

  if (rawOptions.length > MAX_SELECT_OPTIONS) {
    errors.push({
      field: `${path}.options`,
      message: `options 数量不能超过 ${MAX_SELECT_OPTIONS}`,
    });
  }

  const seenValues = new Set<string>();
  return rawOptions
    .map((option, index) => {
      if (!isObject(option)) {
        errors.push({
          field: `${path}.options[${index}]`,
          message: 'option 必须是对象',
        });
        return null;
      }

      const label = readTrimmedString(option.label);
      const value = option.value;
      if (!label) {
        errors.push({
          field: `${path}.options[${index}].label`,
          message: 'option label 不能为空',
        });
      }

      if (!isScalar(value)) {
        errors.push({
          field: `${path}.options[${index}].value`,
          message: 'option value 必须是字符串、数字或布尔值',
        });
        return null;
      }

      const valueKey = JSON.stringify(value);
      if (seenValues.has(valueKey)) {
        errors.push({
          field: `${path}.options[${index}].value`,
          message: 'option value 不能重复',
        });
      }
      seenValues.add(valueKey);

      return {
        label,
        value,
      };
    })
    .filter((option): option is ParameterSchemaOption => option !== null);
}

function coerceAndValidateFieldValue(
  field: ParameterSchemaField,
  rawValue: unknown,
  errors: Array<{ field: string; message: string }>,
  overridePath?: string,
): string | number | boolean | null | undefined {
  const path = overridePath ?? field.key;

  if (rawValue === null || rawValue === '') {
    if (field.required) {
      errors.push({
        field: path,
        message: '必填参数不能为空',
      });
    }
    return null;
  }

  switch (field.type) {
    case 'string': {
      if (typeof rawValue !== 'string') {
        errors.push({
          field: path,
          message: '参数必须是字符串',
        });
        return undefined;
      }
      return rawValue;
    }
    case 'number':
    case 'integer': {
      const value = typeof rawValue === 'number' ? rawValue : NaN;
      if (!Number.isFinite(value)) {
        errors.push({
          field: path,
          message: '参数必须是数字',
        });
        return undefined;
      }
      if (field.type === 'integer' && !Number.isInteger(value)) {
        errors.push({
          field: path,
          message: '参数必须是整数',
        });
      }
      if (field.min !== undefined && value < field.min) {
        errors.push({
          field: path,
          message: `参数不能小于 ${field.min}`,
        });
      }
      if (field.max !== undefined && value > field.max) {
        errors.push({
          field: path,
          message: `参数不能大于 ${field.max}`,
        });
      }
      return value;
    }
    case 'boolean': {
      if (typeof rawValue !== 'boolean') {
        errors.push({
          field: path,
          message: '参数必须是布尔值',
        });
        return undefined;
      }
      return rawValue;
    }
    case 'select': {
      if (!isScalar(rawValue)) {
        errors.push({
          field: path,
          message: '参数必须匹配一个选项值',
        });
        return undefined;
      }
      if (
        !field.options?.some((option) => JSON.stringify(option.value) === JSON.stringify(rawValue))
      ) {
        errors.push({
          field: path,
          message: '参数不在允许的选项中',
        });
      }
      return rawValue;
    }
  }
}

function normalizePlainObject(rawValue: unknown, field: string): JsonObject {
  if (rawValue === undefined || rawValue === null) {
    return {};
  }

  if (!isObject(rawValue) || Array.isArray(rawValue)) {
    throwParameterSchemaError([
      {
        field,
        message: `${field} 必须是对象`,
      },
    ]);
  }

  return rawValue;
}

function throwParameterSchemaError(details: Array<{ field: string; message: string }>): never {
  const error = new Error('parameter schema validation failed');
  Object.assign(error, {
    details,
  });
  throw error;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  );
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return typeof value === 'string' ? value.trim() : undefined;
}

function readFiniteNumber(
  value: unknown,
  field: string,
  errors: Array<{ field: string; message: string }>,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({
      field,
      message: '必须是数字',
    });
    return null;
  }

  return value;
}

function isParameterFieldType(value: string): value is ParameterFieldType {
  return (PARAMETER_FIELD_TYPES as readonly string[]).includes(value);
}
