import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageDriver, type Asset, type Prisma, type StorageSetting } from '@prisma/client';
import sharp from 'sharp';

import { loadConfig } from '@dreamstudio/config';
import { prisma } from '@dreamstudio/db';

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_REFERENCE_RETENTION_HOURS = 12;
export const DEFAULT_RESULT_RETENTION_HOURS = 24 * 30;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const KEY_VERSION = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class DreamStudioSecretCodec implements SecretCodec {
  private readonly masterKey = this.readMasterKey();

  encryptSecret(secret: string): EncryptedSecretPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64url'),
      iv: iv.toString('base64url'),
      tag: tag.toString('base64url'),
      keyVersion: KEY_VERSION,
    };
  }

  decryptSecret(secret: EncryptedSecretPayload): string {
    if (secret.keyVersion !== KEY_VERSION) {
      throw new Error('Unsupported key version');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKey,
      Buffer.from(secret.iv, 'base64url'),
      {
        authTagLength: AUTH_TAG_LENGTH,
      },
    );
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(secret.encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  maskSecret(secret: string): string {
    const trimmed = secret.trim();
    if (trimmed.length <= 8) {
      return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
    }

    return `${trimmed.slice(0, 5)}***${trimmed.slice(-4)}`;
  }

  private readMasterKey(): Buffer {
    const configured = loadConfig().dreamstudioSecretKey.trim();
    if (configured.length < 32) {
      throw new Error('DREAMSTUDIO_SECRET_KEY must be at least 32 characters');
    }

    const base64Decoded = this.decodeBase64Key(configured);
    if (base64Decoded?.length === 32) {
      return base64Decoded;
    }

    if (Buffer.byteLength(configured, 'utf8') === 32) {
      return Buffer.from(configured, 'utf8');
    }

    return createHash('sha256').update(configured, 'utf8').digest();
  }

  private decodeBase64Key(value: string): Buffer | null {
    if (!/^[a-zA-Z0-9+/=_-]+$/.test(value)) {
      return null;
    }

    try {
      return Buffer.from(
        value,
        value.includes('-') || value.includes('_') ? 'base64url' : 'base64',
      );
    } catch {
      return null;
    }
  }
}

export interface EncryptedSecretPayload {
  encrypted: string;
  iv: string;
  tag: string;
  keyVersion: number;
}

export interface SecretCodec {
  encryptSecret(secret: string): EncryptedSecretPayload;
  decryptSecret(secret: EncryptedSecretPayload): string;
  maskSecret(secret: string): string;
}

export interface ResolvedStorageSettings {
  id: string | null;
  driver: StorageDriver;
  localInputPath: string;
  localOutputPath: string;
  referenceRetentionHours: number;
  resultRetentionHours: number;
  s3: ResolvedS3Settings | null;
  public: PublicStorageSettings;
}

export interface ResolvedS3Settings {
  endpoint: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
  publicBaseUrl: string | null;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface PublicStorageSettings {
  id: string | null;
  driver: 'local' | 's3';
  local_input_path: string;
  local_output_path: string;
  s3_endpoint: string | null;
  s3_bucket: string | null;
  s3_region: string | null;
  s3_force_path_style: boolean;
  s3_public_base_url: string | null;
  masked_s3_access_key: string | null;
  masked_s3_secret_key: string | null;
  reference_retention_hours: number;
  result_retention_hours: number;
  updated_at: string | null;
}

export interface StorageSettingsInput {
  driver?: unknown;
  local_input_path?: unknown;
  local_output_path?: unknown;
  s3_endpoint?: unknown;
  s3_bucket?: unknown;
  s3_region?: unknown;
  s3_force_path_style?: unknown;
  s3_public_base_url?: unknown;
  s3_access_key?: unknown;
  s3_secret_key?: unknown;
  reference_retention_hours?: unknown;
  result_retention_hours?: unknown;
}

export interface PreparedStorageSettingsUpdate {
  data: Prisma.StorageSettingUncheckedCreateInput;
  changedFields: string[];
}

export interface UploadImageInput {
  buffer: Buffer;
  codec?: SecretCodec;
  originalFilename: string;
  userId: string;
  kind: 'reference_image' | 'result_image';
  maxBytes?: number;
}

export interface StoredImageObject {
  storageDriver: StorageDriver;
  bucket: string | null;
  objectKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: bigint;
  width: number | null;
  height: number | null;
  checksum: string;
  expiresAt: Date | null;
}

export interface DownloadObjectResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  filename: string;
}

export interface ReadAssetBufferResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface CleanupResult {
  scannedCount: number;
  deletedCount: number;
  failedCount: number;
  errors: string[];
}

export class StorageValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'StorageValidationError';
    this.field = field;
  }
}

export function defaultLocalInputPath() {
  return join(loadConfig().localStorageRoot, 'assets', 'references');
}

export function defaultLocalOutputPath() {
  return join(loadConfig().localStorageRoot, 'assets', 'results');
}

export function serializePublicStorageSettings(
  settings: StorageSetting | null,
): PublicStorageSettings {
  return {
    id: settings?.id ?? null,
    driver: settings?.driver ?? 'local',
    local_input_path: settings?.localInputPath ?? defaultLocalInputPath(),
    local_output_path: settings?.localOutputPath ?? defaultLocalOutputPath(),
    s3_endpoint: settings?.s3Endpoint ?? null,
    s3_bucket: settings?.s3Bucket ?? null,
    s3_region: settings?.s3Region ?? null,
    s3_force_path_style: settings?.s3ForcePathStyle ?? true,
    s3_public_base_url: settings?.s3PublicBaseUrl ?? null,
    masked_s3_access_key: settings?.maskedS3AccessKey ?? null,
    masked_s3_secret_key: settings?.maskedS3SecretKey ?? null,
    reference_retention_hours:
      settings?.referenceRetentionHours ?? DEFAULT_REFERENCE_RETENTION_HOURS,
    result_retention_hours: settings?.resultRetentionHours ?? DEFAULT_RESULT_RETENTION_HOURS,
    updated_at: settings?.updatedAt.toISOString() ?? null,
  };
}

export function resolvePreparedStorageSettings(
  data: Prisma.StorageSettingUncheckedCreateInput,
  codec?: SecretCodec,
): ResolvedStorageSettings {
  const localInputPath = normalizeStorageRoot(
    data.localInputPath ?? defaultLocalInputPath(),
    defaultLocalInputPath(),
  );
  const localOutputPath = normalizeStorageRoot(
    data.localOutputPath ?? defaultLocalOutputPath(),
    defaultLocalOutputPath(),
  );
  const driver = data.driver ?? StorageDriver.local;
  const publicSettings: PublicStorageSettings = {
    id: null,
    driver,
    local_input_path: localInputPath,
    local_output_path: localOutputPath,
    s3_endpoint: data.s3Endpoint ?? null,
    s3_bucket: data.s3Bucket ?? null,
    s3_region: data.s3Region ?? null,
    s3_force_path_style: data.s3ForcePathStyle ?? true,
    s3_public_base_url: data.s3PublicBaseUrl ?? null,
    masked_s3_access_key: data.maskedS3AccessKey ?? null,
    masked_s3_secret_key: data.maskedS3SecretKey ?? null,
    reference_retention_hours: data.referenceRetentionHours ?? DEFAULT_REFERENCE_RETENTION_HOURS,
    result_retention_hours: data.resultRetentionHours ?? DEFAULT_RESULT_RETENTION_HOURS,
    updated_at: null,
  };

  return {
    id: null,
    driver,
    localInputPath,
    localOutputPath,
    referenceRetentionHours: publicSettings.reference_retention_hours,
    resultRetentionHours: publicSettings.result_retention_hours,
    s3: driver === StorageDriver.s3 ? resolveS3SettingsFromData(data, codec) : null,
    public: publicSettings,
  };
}

export async function getActiveStorageSettingRecord() {
  return prisma.storageSetting.findFirst({
    where: {
      isActive: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
}

export async function resolveStorageSettings(
  codec?: SecretCodec,
): Promise<ResolvedStorageSettings> {
  const settings = await getActiveStorageSettingRecord();
  const publicSettings = serializePublicStorageSettings(settings);
  const localInputPath = normalizeStorageRoot(
    publicSettings.local_input_path,
    defaultLocalInputPath(),
  );
  const localOutputPath = normalizeStorageRoot(
    publicSettings.local_output_path,
    defaultLocalOutputPath(),
  );
  const driver = settings?.driver ?? StorageDriver.local;

  return {
    id: settings?.id ?? null,
    driver,
    localInputPath,
    localOutputPath,
    referenceRetentionHours: publicSettings.reference_retention_hours,
    resultRetentionHours: publicSettings.result_retention_hours,
    s3: driver === StorageDriver.s3 ? resolveS3Settings(settings, codec) : null,
    public: {
      ...publicSettings,
      local_input_path: localInputPath,
      local_output_path: localOutputPath,
    },
  };
}

export function prepareStorageSettingsUpdate({
  body,
  codec,
  existing,
  updatedBy,
}: {
  body: StorageSettingsInput;
  codec: SecretCodec;
  existing: StorageSetting | null;
  updatedBy: string;
}): PreparedStorageSettingsUpdate {
  const currentPublic = serializePublicStorageSettings(existing);
  const data: Prisma.StorageSettingUncheckedCreateInput = {
    driver: readDriver(body.driver, currentPublic.driver),
    isActive: true,
    localInputPath: readOptionalPath(
      body.local_input_path,
      currentPublic.local_input_path,
      'local_input_path',
    ),
    localOutputPath: readOptionalPath(
      body.local_output_path,
      currentPublic.local_output_path,
      'local_output_path',
    ),
    s3Endpoint: readOptionalString(body.s3_endpoint, currentPublic.s3_endpoint, 's3_endpoint', 500),
    s3Bucket: readOptionalString(body.s3_bucket, currentPublic.s3_bucket, 's3_bucket', 220),
    s3Region: readOptionalString(
      body.s3_region,
      currentPublic.s3_region ?? 'auto',
      's3_region',
      80,
    ),
    s3ForcePathStyle: readBoolean(body.s3_force_path_style, currentPublic.s3_force_path_style),
    s3PublicBaseUrl: readOptionalUrl(
      body.s3_public_base_url,
      currentPublic.s3_public_base_url,
      's3_public_base_url',
    ),
    encryptedS3AccessKey: existing?.encryptedS3AccessKey ?? null,
    s3AccessKeyIv: existing?.s3AccessKeyIv ?? null,
    s3AccessKeyTag: existing?.s3AccessKeyTag ?? null,
    s3AccessKeyVersion: existing?.s3AccessKeyVersion ?? null,
    maskedS3AccessKey: existing?.maskedS3AccessKey ?? null,
    encryptedS3SecretKey: existing?.encryptedS3SecretKey ?? null,
    s3SecretKeyIv: existing?.s3SecretKeyIv ?? null,
    s3SecretKeyTag: existing?.s3SecretKeyTag ?? null,
    s3SecretKeyVersion: existing?.s3SecretKeyVersion ?? null,
    maskedS3SecretKey: existing?.maskedS3SecretKey ?? null,
    referenceRetentionHours: readHours(
      body.reference_retention_hours,
      currentPublic.reference_retention_hours,
      'reference_retention_hours',
    ),
    resultRetentionHours: readHours(
      body.result_retention_hours,
      currentPublic.result_retention_hours,
      'result_retention_hours',
    ),
    updatedBy,
  };

  const accessKey = readSecretInput(body.s3_access_key);
  if (accessKey !== null) {
    const encrypted = codec.encryptSecret(accessKey);
    data.encryptedS3AccessKey = encrypted.encrypted;
    data.s3AccessKeyIv = encrypted.iv;
    data.s3AccessKeyTag = encrypted.tag;
    data.s3AccessKeyVersion = encrypted.keyVersion;
    data.maskedS3AccessKey = codec.maskSecret(accessKey);
  }

  const secretKey = readSecretInput(body.s3_secret_key);
  if (secretKey !== null) {
    const encrypted = codec.encryptSecret(secretKey);
    data.encryptedS3SecretKey = encrypted.encrypted;
    data.s3SecretKeyIv = encrypted.iv;
    data.s3SecretKeyTag = encrypted.tag;
    data.s3SecretKeyVersion = encrypted.keyVersion;
    data.maskedS3SecretKey = codec.maskSecret(secretKey);
  }

  if (data.driver === StorageDriver.s3) {
    assertRequired(data.s3Endpoint, 's3_endpoint');
    assertRequired(data.s3Bucket, 's3_bucket');
    assertRequired(data.s3Region, 's3_region');
    assertRequired(data.encryptedS3AccessKey, 's3_access_key');
    assertRequired(data.encryptedS3SecretKey, 's3_secret_key');
  }

  return {
    data,
    changedFields: computeChangedFields(existing, data, Boolean(accessKey), Boolean(secretKey)),
  };
}

export async function saveStorageSettingsUpdate(input: PreparedStorageSettingsUpdate) {
  const existing = await getActiveStorageSettingRecord();
  if (existing) {
    return prisma.storageSetting.update({
      where: {
        id: existing.id,
      },
      data: input.data,
    });
  }

  return prisma.storageSetting.create({
    data: input.data,
  });
}

export async function uploadImageObject(input: UploadImageInput): Promise<StoredImageObject> {
  await assertImageBuffer(input.buffer, input.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES);
  const metadata = await readImageMetadata(input.buffer);
  const mimeType = metadata.mimeType;
  const objectKey = generateObjectKey(input.kind, input.userId, mimeType);
  const filename = buildDownloadFilename(input.originalFilename, mimeType);
  const checksum = createHash('sha256').update(input.buffer).digest('hex');
  const settings = await resolveStorageSettings(input.codec);
  const expiresAt =
    input.kind === 'reference_image'
      ? new Date(Date.now() + settings.referenceRetentionHours * 60 * 60 * 1000)
      : settings.resultRetentionHours > 0
        ? new Date(Date.now() + settings.resultRetentionHours * 60 * 60 * 1000)
        : null;

  if (settings.driver === StorageDriver.s3) {
    if (!settings.s3) {
      throw new Error('S3 storage is not configured');
    }
    await putS3Object(settings.s3, objectKey, input.buffer, mimeType);
    return {
      storageDriver: StorageDriver.s3,
      bucket: settings.s3.bucket,
      objectKey,
      filename,
      mimeType,
      sizeBytes: BigInt(input.buffer.length),
      width: metadata.width,
      height: metadata.height,
      checksum,
      expiresAt,
    };
  }

  const basePath =
    input.kind === 'reference_image' ? settings.localInputPath : settings.localOutputPath;
  const fullPath = safeJoin(basePath, objectKey);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, input.buffer, { flag: 'wx' });

  return {
    storageDriver: StorageDriver.local,
    bucket: null,
    objectKey,
    filename,
    mimeType,
    sizeBytes: BigInt(input.buffer.length),
    width: metadata.width,
    height: metadata.height,
    checksum,
    expiresAt,
  };
}

export async function getDownloadUrl(
  asset: Asset,
  codec?: SecretCodec,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (asset.storageDriver !== StorageDriver.s3) {
    return null;
  }

  const settings = await resolveStorageSettings(codec);
  if (settings.s3?.publicBaseUrl) {
    return `${settings.s3.publicBaseUrl.replace(/\/+$/, '')}/${asset.objectKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`;
  }

  if (!settings.s3 || asset.bucket !== settings.s3.bucket) {
    return null;
  }

  const client = createS3Client(settings.s3);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: settings.s3.bucket,
      Key: asset.objectKey,
      ResponseContentDisposition: contentDisposition(asset.filename),
      ResponseContentType: asset.mimeType,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function openDownloadObject(
  asset: Asset,
  codec?: SecretCodec,
): Promise<DownloadObjectResult> {
  if (asset.storageDriver === StorageDriver.s3) {
    const settings = await resolveStorageSettings(codec);
    if (!settings.s3 || asset.bucket !== settings.s3.bucket) {
      throw new Error('S3 storage is not configured for this asset');
    }

    const response = await createS3Client(settings.s3).send(
      new GetObjectCommand({
        Bucket: settings.s3.bucket,
        Key: asset.objectKey,
      }),
    );

    return {
      stream:
        response.Body instanceof Readable ? response.Body : Readable.from(response.Body as never),
      contentType: response.ContentType ?? asset.mimeType,
      contentLength: response.ContentLength,
      filename: asset.filename,
    };
  }

  const basePath = await resolveLocalBasePathForAsset(asset);
  return {
    stream: createReadStream(safeJoin(basePath, asset.objectKey)),
    contentType: asset.mimeType,
    filename: asset.filename,
    contentLength: Number(asset.sizeBytes),
  };
}

export async function readAssetBuffer(
  asset: Asset,
  codec?: SecretCodec,
): Promise<ReadAssetBufferResult> {
  const download = await openDownloadObject(asset, codec);
  const chunks: Buffer[] = [];
  for await (const chunk of download.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return {
    buffer: Buffer.concat(chunks),
    contentType: download.contentType,
    filename: download.filename,
  };
}

export async function deletePhysicalAsset(asset: Asset, codec?: SecretCodec): Promise<boolean> {
  if (asset.storageDriver === StorageDriver.s3) {
    const settings = await resolveStorageSettings(codec);
    if (!settings.s3 || asset.bucket !== settings.s3.bucket) {
      return false;
    }

    await createS3Client(settings.s3).send(
      new DeleteObjectCommand({
        Bucket: settings.s3.bucket,
        Key: asset.objectKey,
      }),
    );
    return true;
  }

  const basePath = await resolveLocalBasePathForAsset(asset);
  await rm(safeJoin(basePath, asset.objectKey), { force: true });
  return true;
}

export async function testResolvedStorageSettings(settings: ResolvedStorageSettings) {
  const key = `storage-tests/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`;
  const body = Buffer.from('dreamstudio-storage-test', 'utf8');

  if (settings.driver === StorageDriver.s3) {
    if (!settings.s3) {
      throw new Error('S3 storage is not configured');
    }
    await putS3Object(settings.s3, key, body, 'text/plain');
    await createS3Client(settings.s3).send(
      new DeleteObjectCommand({
        Bucket: settings.s3.bucket,
        Key: key,
      }),
    );
    return;
  }

  const localRoot = settings.localInputPath;
  const path = safeJoin(localRoot, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, { flag: 'wx' });
  await rm(path, { force: true });
}

export async function cleanupAssets({
  before,
  codec,
  kind,
  limit,
}: {
  before: Date;
  codec?: SecretCodec;
  kind?: 'reference_image' | 'result_image';
  limit: number;
}): Promise<CleanupResult> {
  const assets = await prisma.asset.findMany({
    where: {
      OR: [
        {
          status: 'available',
          expiresAt: {
            not: null,
            lte: before,
          },
        },
        {
          status: 'deleted',
          needsPhysicalDelete: true,
        },
      ],
      ...(kind ? { kind } : {}),
      cleanedAt: null,
    },
    orderBy: {
      updatedAt: 'asc',
    },
    take: limit,
  });
  const result: CleanupResult = {
    scannedCount: assets.length,
    deletedCount: 0,
    failedCount: 0,
    errors: [],
  };

  for (const asset of assets) {
    try {
      await deletePhysicalAsset(asset, codec);
      await prisma.asset.update({
        where: {
          id: asset.id,
        },
        data: {
          status: 'expired_cleaned',
          cleanedAt: new Date(),
          needsPhysicalDelete: false,
          deletedAt: asset.deletedAt ?? new Date(),
        },
      });
      result.deletedCount += 1;
    } catch (error) {
      result.failedCount += 1;
      result.errors.push(`${asset.id}: ${sanitizeStorageError(error)}`);
      await prisma.asset.update({
        where: {
          id: asset.id,
        },
        data: {
          needsPhysicalDelete: true,
        },
      });
    }
  }

  return result;
}

export function sanitizeStorageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\/[^\s'"]+/g, '[path]')
    .replace(/[A-Za-z0-9+/_-]{24,}={0,2}/g, '[redacted]')
    .slice(0, 240);
}

export function assetDownloadPath(assetId: string) {
  return `/api/v1/assets/download/${assetId}`;
}

function createS3Client(settings: ResolvedS3Settings) {
  return new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle: settings.forcePathStyle,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
}

function resolveS3Settings(
  settings: StorageSetting | null,
  codec?: SecretCodec,
): ResolvedS3Settings | null {
  if (!settings || !codec) {
    return null;
  }

  if (
    !settings.s3Endpoint ||
    !settings.s3Bucket ||
    !settings.encryptedS3AccessKey ||
    !settings.s3AccessKeyIv ||
    !settings.s3AccessKeyTag ||
    !settings.s3AccessKeyVersion ||
    !settings.encryptedS3SecretKey ||
    !settings.s3SecretKeyIv ||
    !settings.s3SecretKeyTag ||
    !settings.s3SecretKeyVersion
  ) {
    return null;
  }

  return {
    endpoint: settings.s3Endpoint,
    bucket: settings.s3Bucket,
    region: settings.s3Region ?? 'auto',
    forcePathStyle: settings.s3ForcePathStyle,
    publicBaseUrl: settings.s3PublicBaseUrl,
    accessKeyId: codec.decryptSecret({
      encrypted: settings.encryptedS3AccessKey,
      iv: settings.s3AccessKeyIv,
      tag: settings.s3AccessKeyTag,
      keyVersion: settings.s3AccessKeyVersion,
    }),
    secretAccessKey: codec.decryptSecret({
      encrypted: settings.encryptedS3SecretKey,
      iv: settings.s3SecretKeyIv,
      tag: settings.s3SecretKeyTag,
      keyVersion: settings.s3SecretKeyVersion,
    }),
  };
}

function resolveS3SettingsFromData(
  data: Prisma.StorageSettingUncheckedCreateInput,
  codec?: SecretCodec,
): ResolvedS3Settings | null {
  if (!codec) {
    return null;
  }
  if (
    !data.s3Endpoint ||
    !data.s3Bucket ||
    !data.encryptedS3AccessKey ||
    !data.s3AccessKeyIv ||
    !data.s3AccessKeyTag ||
    !data.s3AccessKeyVersion ||
    !data.encryptedS3SecretKey ||
    !data.s3SecretKeyIv ||
    !data.s3SecretKeyTag ||
    !data.s3SecretKeyVersion
  ) {
    return null;
  }

  return {
    endpoint: data.s3Endpoint,
    bucket: data.s3Bucket,
    region: data.s3Region ?? 'auto',
    forcePathStyle: data.s3ForcePathStyle ?? true,
    publicBaseUrl: data.s3PublicBaseUrl ?? null,
    accessKeyId: codec.decryptSecret({
      encrypted: data.encryptedS3AccessKey,
      iv: data.s3AccessKeyIv,
      tag: data.s3AccessKeyTag,
      keyVersion: data.s3AccessKeyVersion,
    }),
    secretAccessKey: codec.decryptSecret({
      encrypted: data.encryptedS3SecretKey,
      iv: data.s3SecretKeyIv,
      tag: data.s3SecretKeyTag,
      keyVersion: data.s3SecretKeyVersion,
    }),
  };
}

async function resolveLocalBasePathForAsset(asset: Asset) {
  const settings = await resolveStorageSettings();
  return asset.kind === 'reference_image' ? settings.localInputPath : settings.localOutputPath;
}

async function putS3Object(
  settings: ResolvedS3Settings,
  objectKey: string,
  body: Buffer,
  contentType: string,
) {
  await createS3Client(settings).send(
    new PutObjectCommand({
      Bucket: settings.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ChecksumSHA256: createHash('sha256').update(body).digest('base64'),
    }),
  );
}

async function assertImageBuffer(buffer: Buffer, maxBytes: number) {
  if (buffer.length <= 0) {
    throw new StorageValidationError('file', '上传文件不能为空');
  }

  if (buffer.length > maxBytes) {
    throw new StorageValidationError(
      'file',
      `图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`,
    );
  }

  await readImageMetadata(buffer);
}

async function readImageMetadata(buffer: Buffer) {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, {
      animated: false,
      failOn: 'none',
    }).metadata();
  } catch {
    throw new StorageValidationError('file', '无法识别图片类型');
  }

  const mimeType = mimeTypeFromSharpFormat(metadata.format);
  if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new StorageValidationError('file', '仅支持 JPEG、PNG、WebP 或 GIF 图片');
  }

  return {
    mimeType,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

function mimeTypeFromSharpFormat(format: string | undefined) {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return null;
  }
}

function generateObjectKey(
  kind: 'reference_image' | 'result_image',
  userId: string,
  mimeType: string,
) {
  const now = new Date();
  const datePrefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}/${String(now.getUTCDate()).padStart(2, '0')}`;
  const kindPath = kind === 'reference_image' ? 'references' : 'results';
  return `${kindPath}/${userId}/${datePrefix}/${randomUUID()}${IMAGE_EXTENSIONS[mimeType] ?? '.bin'}`;
}

function buildDownloadFilename(originalFilename: string, mimeType: string) {
  const safeBase = basename(originalFilename || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${safeBase || 'image'}${IMAGE_EXTENSIONS[mimeType] ?? (extname(originalFilename) || '.bin')}`;
}

function normalizeStorageRoot(value: string | null, fallback: string) {
  const resolved = resolve(value && value.trim() ? value.trim() : fallback);
  return resolved;
}

function safeJoin(basePath: string, objectKey: string) {
  if (objectKey.includes('\\') || objectKey.split('/').some((part) => part === '..')) {
    throw new Error('Invalid object key');
  }

  const base = resolve(basePath);
  const target = normalize(resolve(base, objectKey));
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error('Invalid object key');
  }
  return target;
}

function readDriver(value: unknown, fallback: 'local' | 's3'): StorageDriver {
  if (value === undefined || value === null || value === '') {
    return fallback === 's3' ? StorageDriver.s3 : StorageDriver.local;
  }
  if (value === 'local') {
    return StorageDriver.local;
  }
  if (value === 's3') {
    return StorageDriver.s3;
  }
  throw new StorageValidationError('driver', '存储驱动必须是 local 或 s3');
}

function readOptionalString(
  value: unknown,
  fallback: string | null,
  field: string,
  maxLength: number,
) {
  if (value === undefined) {
    return fallback;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new StorageValidationError(field, '必须是字符串');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new StorageValidationError(field, '内容过长');
  }
  return trimmed;
}

function readOptionalPath(value: unknown, fallback: string, field: string) {
  const path = readOptionalString(value, fallback, field, 1000) ?? fallback;
  if (!path.startsWith('/')) {
    throw new StorageValidationError(field, '本地路径必须是绝对路径');
  }
  return normalizeStorageRoot(path, fallback);
}

function readOptionalUrl(value: unknown, fallback: string | null, field: string) {
  const url = readOptionalString(value, fallback, field, 1000);
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('bad protocol');
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new StorageValidationError(field, '必须是有效 URL');
  }
}

function readBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new StorageValidationError('s3_force_path_style', '必须是布尔值');
  }
  return value;
}

function readHours(value: unknown, fallback: number, field: string) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 87600) {
    throw new StorageValidationError(field, '保留时间必须在 1 到 87600 小时之间');
  }
  return parsed;
}

function readSecretInput(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new StorageValidationError('secret', '密钥必须是字符串');
  }
  const trimmed = value.trim();
  if (!trimmed || /^(\*+|••••+)$/.test(trimmed)) {
    return null;
  }
  if (trimmed.length > 1000) {
    throw new StorageValidationError('secret', '密钥过长');
  }
  return trimmed;
}

function assertRequired(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') {
    throw new StorageValidationError(field, `${field} 不能为空`);
  }
}

function computeChangedFields(
  existing: StorageSetting | null,
  data: Prisma.StorageSettingUncheckedCreateInput,
  accessKeyChanged: boolean,
  secretKeyChanged: boolean,
) {
  if (!existing) {
    return Object.keys(data).filter((key) => !key.startsWith('encrypted'));
  }

  const comparable: Array<keyof Prisma.StorageSettingUncheckedCreateInput> = [
    'driver',
    'localInputPath',
    'localOutputPath',
    's3Endpoint',
    's3Bucket',
    's3Region',
    's3ForcePathStyle',
    's3PublicBaseUrl',
    'referenceRetentionHours',
    'resultRetentionHours',
  ];
  const changed = comparable.filter((key) => {
    const existingValue = existing[key as keyof StorageSetting];
    return data[key] !== existingValue;
  });

  if (accessKeyChanged) {
    changed.push('maskedS3AccessKey');
  }
  if (secretKeyChanged) {
    changed.push('maskedS3SecretKey');
  }

  return changed.map((key) => String(key));
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
