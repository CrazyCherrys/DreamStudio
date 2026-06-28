import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

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

const generationMapping = {
  content_type: 'json',
  fields: [
    { source: 'model', target: 'model' },
    { source: 'prompt', target: 'prompt' },
    { source: 'params.n', target: 'n', omit_if_null: true },
    { source: 'params.size', target: 'size', omit_if_null: true },
  ],
};

const editMapping = {
  content_type: 'multipart',
  reference_field: {
    target: 'image',
    mode: 'repeat',
  },
  fields: [
    { source: 'model', target: 'model' },
    { source: 'prompt', target: 'prompt' },
    { source: 'params.size', target: 'size', omit_if_null: true },
  ],
};

const responsesMapping = {
  content_type: 'json',
  fields: [
    { source: 'model', target: 'model' },
    { source: 'prompt', target: 'input', transform: 'promptToResponsesInput' },
    { source: 'params.action', target: 'tools[0].action', omit_if_null: true },
  ],
  constants: [{ target: 'tools[0].type', value: 'image_generation' }],
};

async function main() {
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

  try {
    const generationAdapter = getImageGenerationAdapter('openai_images_generation');
    const generationResponse = await generationAdapter.execute({
      apiKey: 'sk-verify-adapters',
      client,
      parameters: {
        n: 2,
        size: '1024x1024',
      },
      prompt: 'adapter generation verifier',
      references: [],
      task: buildTask({
        adapterKey: 'openai_images_generation',
        endpointPath: '/v1/images/generations',
        requestMapping: generationMapping,
        baseUrl,
      }),
      timeoutMs: 30_000,
    });

    const generationRequest = requests.at(-1);
    assert(generationRequest, 'generation request was not captured');
    assert(generationRequest.method === 'POST', 'generation adapter must POST');
    assert(
      generationRequest.url === '/v1/images/generations',
      'generation adapter used wrong endpoint',
    );
    assert(
      String(generationRequest.headers['content-type']).includes('application/json'),
      'generation adapter must send JSON',
    );
    const generationBody = JSON.parse(generationRequest.body.toString('utf8')) as Record<
      string,
      unknown
    >;
    assert(generationBody.model === 'gpt-image-2', 'generation body model mismatch');
    assert(
      generationBody.prompt === 'adapter generation verifier',
      'generation body prompt mismatch',
    );
    assert(generationBody.n === 2, 'generation body parameter mismatch');
    assert(
      generationResponse.data[0]?.url === 'http://example.test/result.png',
      'url parse failed',
    );

    const editAdapter = getImageGenerationAdapter('openai_images_edit');
    const references: NewApiImageReference[] = [
      {
        buffer: Buffer.from('fake-image-bytes'),
        filename: 'reference.png',
        contentType: 'image/png',
      },
    ];
    const editResponse = await editAdapter.execute({
      apiKey: 'sk-verify-adapters',
      client,
      parameters: {
        size: '1024x1024',
      },
      prompt: 'adapter edit verifier',
      references,
      task: buildTask({
        adapterKey: 'openai_images_edit',
        endpointPath: '/v1/images/edits',
        requestMapping: editMapping,
        baseUrl,
      }),
      timeoutMs: 30_000,
    });

    const editRequest = requests.at(-1);
    assert(editRequest, 'edit request was not captured');
    assert(editRequest.method === 'POST', 'edit adapter must POST');
    assert(editRequest.url === '/v1/images/edits', 'edit adapter used wrong endpoint');
    assert(
      String(editRequest.headers['content-type']).includes('multipart/form-data'),
      'edit adapter must send multipart form-data',
    );
    const multipartBody = editRequest.body.toString('utf8');
    assert(multipartBody.includes('name="model"'), 'edit multipart missing model field');
    assert(multipartBody.includes('gpt-image-2'), 'edit multipart model mismatch');
    assert(multipartBody.includes('name="prompt"'), 'edit multipart missing prompt field');
    assert(multipartBody.includes('name="image"'), 'edit multipart missing image reference');
    assert(editResponse.data[0]?.b64_json === 'dmVyaWZ5LWltYWdl', 'b64_json parse failed');

    const responsesAdapter = getImageGenerationAdapter('openai_responses_image');
    const responsesResponse = await responsesAdapter.execute({
      apiKey: 'sk-verify-adapters',
      client,
      parameters: {
        action: 'generate',
      },
      prompt: 'adapter responses verifier',
      references,
      task: buildTask({
        adapterKey: 'openai_responses_image',
        endpointPath: '/v1/responses',
        requestMapping: responsesMapping,
        baseUrl,
      }),
      timeoutMs: 30_000,
    });

    const responsesRequest = requests.at(-1);
    assert(responsesRequest, 'responses request was not captured');
    assert(responsesRequest.method === 'POST', 'responses adapter must POST');
    assert(responsesRequest.url === '/v1/responses', 'responses adapter used wrong endpoint');
    const responsesBody = JSON.parse(responsesRequest.body.toString('utf8')) as Record<
      string,
      unknown
    >;
    assert(responsesBody.model === 'gpt-image-2', 'responses body model mismatch');
    assert(Array.isArray(responsesBody.input), 'responses body input must be structured');
    assert(Array.isArray(responsesBody.tools), 'responses body tools must be present');
    assert(
      responsesResponse.data[0]?.b64_json === 'cmVzcG9uc2VzLWltYWdl',
      'responses image_generation_call parse failed',
    );

    try {
      getImageGenerationAdapter('not_supported');
      throw new Error('unsupported adapter should have failed');
    } catch (error) {
      const normalized = normalizeImageAdapterError(error);
      assert(
        normalized?.code === 'adapter_not_supported',
        'unsupported adapter was not normalized',
      );
    }

    try {
      await generationAdapter.execute({
        apiKey: 'sk-verify-adapters',
        client,
        parameters: {},
        prompt: 'missing snapshot verifier',
        references: [],
        task: {
          ...buildTask({
            adapterKey: 'openai_images_generation',
            endpointPath: '/v1/images/generations',
            requestMapping: generationMapping,
            baseUrl,
          }),
          executionProfileSnapshot: null,
        },
        timeoutMs: 30_000,
      });
      throw new Error('missing profile snapshot should have failed');
    } catch (error) {
      const normalized = normalizeImageAdapterError(error);
      assert(
        normalized?.code === 'profile_snapshot_missing',
        'missing snapshot was not normalized',
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            'generation_adapter_posts_images_generations_json',
            'edit_adapter_posts_images_edits_multipart',
            'image_data_url_parsed',
            'image_data_b64_json_parsed',
            'responses_adapter_posts_responses_json',
            'responses_image_generation_call_parsed',
            'unsupported_adapter_normalized',
            'missing_profile_snapshot_fails',
          ],
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

function sendMockResponse(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/v1/responses') {
    response.end(
      JSON.stringify({
        output: [
          {
            type: 'image_generation_call',
            result: 'cmVzcG9uc2VzLWltYWdl',
          },
        ],
      }),
    );
    return;
  }
  if (request.url === '/v1/images/edits') {
    response.end(
      JSON.stringify({
        data: [
          {
            b64_json: 'dmVyaWZ5LWltYWdl',
          },
        ],
      }),
    );
    return;
  }

  response.end(
    JSON.stringify({
      data: [
        {
          url: 'http://example.test/result.png',
        },
      ],
    }),
  );
}

function buildTask(input: {
  adapterKey: string;
  baseUrl: string;
  endpointPath: string;
  requestMapping: Record<string, unknown>;
  modelId?: string;
}) {
  return {
    adapterKeySnapshot: input.adapterKey,
    executionProfileSnapshot: {
      adapter_key: input.adapterKey,
      adapter_version: '1',
      upstream_model_id: input.modelId ?? 'gpt-image-2',
      upstream_endpoint_path: input.endpointPath,
    },
    modelIdSnapshot: input.modelId ?? 'gpt-image-2',
    newApiBaseUrlSnapshot: input.baseUrl,
    requestMappingSnapshot: input.requestMapping,
    resolvedRequestSanitizedSnapshot: {
      endpoint_path: input.endpointPath,
    },
  } as never;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
