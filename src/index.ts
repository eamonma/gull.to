// Cloudflare Worker entrypoint per instructions.md architecture.
// TDD target: this file wires static mapping JSON + versions into the worker handler.

import mappingData from '../data/mapping/map-2024.09.json';
import { createWorkerHandler } from '@infrastructure/worker-handler';
import { MappingRecord } from '@domain/types';

// Central place to define versions until automated.
const WORKER_VERSION = 'v0.1.0'; // TODO: inject via build/tag automation.
// Derive map version from filename convention map-YYYY.MM.json
const MAP_VERSION = '2024.09';

// Infer environment from Wrangler vars (ENVIRONMENT) falling back to development.
function inferEnvironment(
  env: Record<string, any>
): 'production' | 'staging' | 'development' | 'testing' {
  const raw =
    env && env['ENVIRONMENT']
      ? String(env['ENVIRONMENT']).toLowerCase()
      : 'development';
  if (raw.startsWith('prod')) return 'production';
  if (raw.startsWith('stag')) return 'staging';
  if (raw.startsWith('test')) return 'testing';
  return 'development';
}

// Lazy init pattern to avoid re-parsing on each request.
let handler: ReturnType<typeof createWorkerHandler> | null = null;

function getHandler(env: Record<string, any>) {
  if (!handler) {
    handler = createWorkerHandler({
      mappingData: mappingData as unknown as readonly MappingRecord[],
      workerVersion: WORKER_VERSION,
      mapVersion: MAP_VERSION,
      environment: inferEnvironment(env),
    });
  }
  return handler;
}

export default {
  async fetch(
    request: Request,
    env: Record<string, any>,
    ctx: ExecutionContext
  ): Promise<Response> {
    return getHandler(env).fetch(request, env, ctx);
  },
};
