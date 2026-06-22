import {
  compileRequestMapping,
  lintRequestMapping,
  type RequestMapping,
} from '@dreamstudio/config';

const openAiJsonMapping = {
  content_type: 'json',
  fields: [
    { source: 'model', target: 'model' },
    { source: 'prompt', target: 'prompt' },
    { source: 'params.size', target: 'size', transform: 'validateOpenAIImageSize' },
    { source: 'params.n', target: 'n', omit_if_null: true },
  ],
} satisfies RequestMapping;

const openAiMultipartMapping = {
  content_type: 'multipart',
  reference_field: {
    target: 'image[]',
  },
  fields: [
    { source: 'model', target: 'model' },
    { source: 'prompt', target: 'prompt' },
    { source: 'params.size', target: 'size', transform: 'aspectRatioToOpenAISize' },
  ],
} satisfies RequestMapping;

const geminiNestedMapping = {
  content_type: 'json',
  fields: [
    { source: 'prompt', target: 'contents[0].parts[0].text' },
    { source: 'params.aspect_ratio', target: 'generationConfig.responseFormat.image.aspectRatio' },
  ],
  constants: [
    {
      target: 'generationConfig.responseModalities',
      value: ['IMAGE'],
    },
  ],
} satisfies RequestMapping;

function main() {
  const openAiJson = compileRequestMapping(openAiJsonMapping, {
    model: 'gpt-image-2',
    prompt: 'A compact product photo',
    params: {
      size: '1024x1024',
      n: 2,
    },
  });
  assert(openAiJson.contentType === 'json', 'OpenAI JSON mapping content type mismatch');
  assert(openAiJson.body.model === 'gpt-image-2', 'OpenAI JSON model missing');
  assert(openAiJson.body.prompt === 'A compact product photo', 'OpenAI JSON prompt missing');
  assert(openAiJson.body.size === '1024x1024', 'OpenAI JSON size transform failed');
  assert(openAiJson.body.n === 2, 'OpenAI JSON parameter missing');

  const openAiMultipart = compileRequestMapping(openAiMultipartMapping, {
    model: 'gpt-image-2',
    prompt: 'Edit the reference image',
    params: {
      size: '16:9',
    },
  });
  assert(openAiMultipart.contentType === 'multipart', 'OpenAI multipart content type mismatch');
  assert(openAiMultipart.referenceFieldName === 'image[]', 'multipart reference field mismatch');
  assert(openAiMultipart.body.model === 'gpt-image-2', 'multipart model missing');
  assert(openAiMultipart.body.size === '1536x1024', 'aspect ratio transform failed');

  const gemini = compileRequestMapping(geminiNestedMapping, {
    model: 'gemini-2.5-flash-image',
    prompt: 'Create a poster',
    params: {
      aspect_ratio: '1:1',
    },
  });
  assert(
    readPath(gemini.body, ['contents', 0, 'parts', 0, 'text']) === 'Create a poster',
    'Gemini nested contents mapping failed',
  );
  assert(
    readPath(gemini.body, ['generationConfig', 'responseModalities', 0]) === 'IMAGE',
    'Gemini nested constant mapping failed',
  );
  assert(
    readPath(gemini.body, ['generationConfig', 'responseFormat', 'image', 'aspectRatio']) === '1:1',
    'Gemini nested parameter mapping failed',
  );

  const unknownTransformLint = lintRequestMapping({
    ...openAiJsonMapping,
    fields: [{ source: 'params.size', target: 'size', transform: 'evalJavascript' }],
  });
  assert(!unknownTransformLint.ok, 'unknown transform must fail lint');
  assert(
    unknownTransformLint.errors.some((error) => error.message.includes('transform')),
    'unknown transform lint message missing',
  );

  const disallowedTargetLint = lintRequestMapping(openAiJsonMapping, {
    allowedTargetPaths: ['/v1/images/generations'],
    endpointPath: '/v1/responses',
  });
  assert(!disallowedTargetLint.ok, 'disallowed adapter target must fail lint');
  assert(
    disallowedTargetLint.errors.some((error) => error.field === 'upstream_endpoint_path'),
    'disallowed adapter target field mismatch',
  );

  const previewText = JSON.stringify(openAiJson);
  assert(!previewText.includes('sk-'), 'preview must not include API keys');
  assert(!previewText.toLowerCase().includes('authorization'), 'preview must not include auth');
  assert(!previewText.includes('encryptedPrompt'), 'preview must not include encrypted prompt');
  assert(!previewText.includes('user_id'), 'preview must not include user identifiers');

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'openai_json_mapping',
          'openai_multipart_mapping',
          'gemini_nested_mapping',
          'unknown_transform_rejected',
          'non_adapter_target_rejected',
          'preview_sanitized',
        ],
      },
      null,
      2,
    ),
  );
}

function readPath(source: unknown, path: Array<number | string>) {
  return path.reduce<unknown>((current, key) => {
    if (Array.isArray(current) && typeof key === 'number') {
      return current[key];
    }
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      typeof key === 'string'
    ) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main();
