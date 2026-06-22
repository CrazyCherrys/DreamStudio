import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

import {
  getImageGenerationAdapter,
  normalizeImageAdapterError,
} from '../apps/worker/src/modules/image-generation/image-adapter.registry';
import {
  NewApiImageClient,
  type NewApiImageReference,
} from '../apps/worker/src/modules/image-generation/new-api-image.client';

interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirstOrThrow({
    where: {
      role: UserRole.super_admin,
      status: UserStatus.active,
      deletedAt: null,
    },
  });

  const model = await prisma.aiModel.findFirstOrThrow({
    where: {
      modality: 'image',
      isEnabled: true,
      deletedAt: null,
    },
    include: {
      executionProfiles: {
        where: {
          deletedAt: null,
        },
        include: {
          revisions: {
            where: {
              status: 'active',
            },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const publicModel = await prisma.aiModel.findFirstOrThrow({
    where: {
      id: model.id,
      deletedAt: null,
      isEnabled: true,
    },
    include: {
      executionProfiles: {
        where: {
          deletedAt: null,
          isEnabled: true,
          isDefault: true,
        },
        include: {
          revisions: {
            where: {
              status: 'active',
            },
            take: 1,
          },
        },
      },
    },
  });
  assert(
    !publicModel.executionProfiles.some(
      (profile) => profile.revisions[0]?.adapterKey === 'gemini_generate_content',
    ),
    'Disabled Gemini profile should not be public default',
  );
  const geminiProfile = model.executionProfiles.find(
    (profile) => profile.revisions[0]?.adapterKey === 'gemini_generate_content',
  );
  assert(geminiProfile, 'Gemini profile not found');
  assert(!geminiProfile.isDefault, 'Gemini profile should not be default');
  assert(!geminiProfile.isEnabled, 'Gemini profile should stay disabled until gateway support');
  const geminiRevision = geminiProfile.revisions[0]!;
  assert(geminiRevision.status === 'active', 'Gemini revision should be active');
  assert(
    geminiRevision.upstreamEndpointPath?.endsWith(':generateContent') === true,
    'Gemini endpoint path mismatch',
  );

  const requests: CapturedRequest[] = [];
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({
      method: request.method ?? '',
      url: request.url ?? '',
      headers: request.headers,
      body,
    });
    sendMockResponse(request, response);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const client = new NewApiImageClient();
  const adapter = getImageGenerationAdapter('gemini_generate_content');

  try {
    const response = await adapter.execute({
      apiKey: 'sk-gemini-verify',
      client,
      parameters: {
        aspect_ratio: '16:9',
        image_size: '2K',
      },
      prompt: 'A scenic mountain at dawn',
      references: [
        {
          buffer: Buffer.from('reference-image-bytes'),
          filename: 'reference.png',
          contentType: 'image/png',
        } satisfies NewApiImageReference,
      ],
      task: buildTask({
        adapterKey: 'gemini_generate_content',
        endpointPath: geminiRevision.upstreamEndpointPath ?? '',
        requestMapping: geminiRevision.requestMapping as Record<string, unknown>,
        baseUrl,
        modelId: geminiRevision.upstreamModelId,
      }),
      timeoutMs: 30_000,
    });

    const request = requests.at(-1);
    assert(request, 'Gemini request was not captured');
    assert(request.method === 'POST', 'Gemini adapter must POST');
    assert(
      request.url ===
        `/v1beta/models/${encodeURIComponent(geminiRevision.upstreamModelId)}:generateContent`,
      'Gemini adapter used wrong endpoint',
    );
    assert(
      String(request.headers['content-type']).includes('application/json'),
      'Gemini adapter must send JSON',
    );
    const body = JSON.parse(request.body.toString('utf8')) as Record<string, unknown>;
    assert(Array.isArray(body.contents), 'Gemini body missing contents array');
    assert(
      readPath(body, ['contents', 0, 'parts', 0, 'text']) === 'A scenic mountain at dawn',
      'Gemini prompt mapping failed',
    );
    assert(
      readPath(body, ['generationConfig', 'responseModalities', 0]) === 'IMAGE',
      'Gemini response modalities mapping failed',
    );
    assert(
      readPath(body, ['generationConfig', 'responseFormat', 'image', 'aspectRatio']) === '16:9',
      'Gemini aspect ratio mapping failed',
    );
    assert(
      readPath(body, ['generationConfig', 'responseFormat', 'image', 'imageSize']) === '2K',
      'Gemini image size mapping failed',
    );
    assert(
      readPath(body, ['contents', 0, 'parts', 1, 'inlineData', 'data']) ===
        Buffer.from('reference-image-bytes').toString('base64'),
      'Gemini reference image inlineData mapping failed',
    );
    assert(
      response.data[0]?.b64_json === 'R0VNSU5JLUlNQUdFLURBVEE=',
      'Gemini inlineData parse failed',
    );

    try {
      getImageGenerationAdapter('not_supported');
      throw new Error('unsupported adapter should fail');
    } catch (error) {
      const normalized = normalizeImageAdapterError(error);
      assert(
        normalized?.code === 'adapter_not_supported',
        'unsupported adapter normalization failed',
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            'gemini_seed_profile_disabled_until_gateway_support',
            'gemini_adapter_posts_generate_content_json',
            'gemini_prompt_and_reference_images_mapped',
            'gemini_response_modalities_mapped',
            'gemini_inline_data_parsed',
            'unsupported_adapter_normalized',
          ],
          profile_id: geminiProfile.id,
          revision_id: geminiRevision.id,
          operator_id: admin.id,
        },
        null,
        2,
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function buildTask(input: {
  adapterKey: string;
  baseUrl: string;
  endpointPath: string;
  modelId: string;
  requestMapping: Record<string, unknown>;
}) {
  return {
    adapterKeySnapshot: input.adapterKey,
    executionProfileSnapshot: {
      adapter_key: input.adapterKey,
      adapter_version: '1',
      upstream_model_id: input.modelId,
      upstream_endpoint_path: input.endpointPath,
    },
    modelIdSnapshot: input.modelId,
    newApiBaseUrlSnapshot: input.baseUrl,
    requestMappingSnapshot: input.requestMapping,
    resolvedRequestSanitizedSnapshot: {
      endpoint_path: input.endpointPath,
    },
  } as never;
}

function sendMockResponse(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('content-type', 'application/json');
  if (request.url?.includes(':generateContent')) {
    response.end(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'R0VNSU5JLUlNQUdFLURBVEE=',
                    mimeType: 'image/png',
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    return;
  }

  response.end(JSON.stringify({ data: [{ url: 'http://example.test/result.png' }] }));
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
    throw new Error(`Verification failed: ${message}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
