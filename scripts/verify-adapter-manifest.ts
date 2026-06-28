import {
  allowedTargetPathsForAdapter,
  defaultEndpointPathForAdapter,
  findImageAdapterManifest,
  listImageAdapterManifests,
} from '@dreamstudio/config';

const requiredAdapters = [
  'openai_images_generation',
  'openai_images_edit',
  'openai_responses_image',
  'gemini_generate_content',
];

for (const adapterKey of requiredAdapters) {
  const manifest = findImageAdapterManifest(adapterKey);
  assert(manifest, `${adapterKey} manifest missing`);
  assert(manifest.allowedTargetPaths.length > 0, `${adapterKey} allowed paths missing`);
  assert(manifest.responseParserKeys.length > 0, `${adapterKey} parser keys missing`);
}

assert(
  defaultEndpointPathForAdapter('gemini_generate_content', 'gemini-2.5-flash-image') ===
    '/v1beta/models/gemini-2.5-flash-image:generateContent',
  'Gemini generateContent default path mismatch',
);
assert(
  allowedTargetPathsForAdapter('gemini_generate_content', 'gemini-2.5-flash-image')?.includes(
    '/v1beta/models/gemini-2.5-flash-image:generateContent',
  ),
  'Gemini generateContent allowed path did not render model',
);
assert(
  findImageAdapterManifest('openai_responses_image')?.runtimeSupported === true,
  'Responses image runtime should be supported',
);
assert(
  findImageAdapterManifest('openai_responses_image')?.publishable === true,
  'Responses image should be publishable',
);
console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'required_adapter_manifests_exist',
        'adapter_paths_and_parsers_declared',
        'gemini_generate_content_path_renders_model',
        'responses_runtime_supported',
        'responses_publishable',
      ],
      adapters: listImageAdapterManifests().map((manifest) => ({
        key: manifest.key,
        runtime_supported: manifest.runtimeSupported,
        publishable: manifest.publishable,
      })),
    },
    null,
    2,
  ),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}
