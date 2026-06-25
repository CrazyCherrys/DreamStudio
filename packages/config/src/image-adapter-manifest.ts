export interface ImageAdapterManifest {
  allowedTargetPaths: string[];
  contentTypes: Array<'json' | 'multipart'>;
  defaultEndpointPath: string;
  key: string;
  publishable: boolean;
  responseParserKeys: string[];
  runtimeSupported: boolean;
  version: number;
}

export const IMAGE_ADAPTER_MANIFESTS = [
  {
    allowedTargetPaths: ['/v1/images/generations'],
    contentTypes: ['json'],
    defaultEndpointPath: '/v1/images/generations',
    key: 'openai_images_generation',
    publishable: true,
    responseParserKeys: ['openai_image_data'],
    runtimeSupported: true,
    version: 1,
  },
  {
    allowedTargetPaths: ['/v1/images/edits'],
    contentTypes: ['multipart'],
    defaultEndpointPath: '/v1/images/edits',
    key: 'openai_images_edit',
    publishable: true,
    responseParserKeys: ['openai_image_data'],
    runtimeSupported: true,
    version: 1,
  },
  {
    allowedTargetPaths: ['/v1/responses'],
    contentTypes: ['json'],
    defaultEndpointPath: '/v1/responses',
    key: 'openai_responses_image',
    publishable: true,
    responseParserKeys: ['openai_responses_image_generation_call'],
    runtimeSupported: true,
    version: 1,
  },
  {
    allowedTargetPaths: ['/v1beta/models/{model}:generateContent'],
    contentTypes: ['json'],
    defaultEndpointPath: '/v1beta/models/{model}:generateContent',
    key: 'gemini_generate_content',
    publishable: true,
    responseParserKeys: ['gemini_inline_data'],
    runtimeSupported: true,
    version: 1,
  },
  {
    allowedTargetPaths: ['/v1beta/interactions'],
    contentTypes: ['json'],
    defaultEndpointPath: '/v1beta/interactions',
    key: 'gemini_interactions_image',
    publishable: false,
    responseParserKeys: ['gemini_inline_data'],
    runtimeSupported: false,
    version: 1,
  },
] as const satisfies ImageAdapterManifest[];

export type ImageAdapterKey = (typeof IMAGE_ADAPTER_MANIFESTS)[number]['key'];

export function findImageAdapterManifest(
  adapterKey: string | null | undefined,
): ImageAdapterManifest | null {
  if (!adapterKey) {
    return null;
  }
  return IMAGE_ADAPTER_MANIFESTS.find((manifest) => manifest.key === adapterKey) ?? null;
}

export function listImageAdapterManifests(): ImageAdapterManifest[] {
  return IMAGE_ADAPTER_MANIFESTS.map((manifest) => ({ ...manifest }));
}

export function defaultEndpointPathForAdapter(adapterKey: string, upstreamModelId: string) {
  const manifest = findImageAdapterManifest(adapterKey);
  const template = manifest?.defaultEndpointPath ?? '/v1/images/generations';
  return renderAdapterPath(template, upstreamModelId);
}

export function allowedTargetPathsForAdapter(adapterKey: string, upstreamModelId: string) {
  return findImageAdapterManifest(adapterKey)?.allowedTargetPaths.map((path) =>
    renderAdapterPath(path, upstreamModelId),
  );
}

export function renderAdapterPath(path: string, upstreamModelId: string) {
  return path.replace('{model}', encodeURIComponent(upstreamModelId));
}
