// Cloudflare Worker entrypoint per instructions.md architecture.
// TDD target: this file wires static mapping JSON + versions into the worker handler.

import mappingData from '../data/mapping/map-2024.09.json';
import { createWorkerHandler } from '@infrastructure/worker-handler';
import { MappingRecord } from '@domain/types';
import { resolveVersions } from '@infrastructure/versioning';

// Default fallback versions (overridden by environment variables in CI/CD)
const DEFAULT_WORKER_VERSION = 'v0.1.0';
const DEFAULT_MAP_VERSION = '2024.09'; // derived from imported file name; keep in sync with selected mapping file

// Infer environment from Wrangler vars (ENVIRONMENT) falling back to development.
type DeploymentEnvironment =
  | 'production'
  | 'staging'
  | 'development'
  | 'testing';

function inferEnvironment(env: Record<string, unknown>): DeploymentEnvironment {
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
let cachedEnvFingerprint: string | null = null;

function envFingerprint(env: Record<string, unknown>): string {
  return [
    env['ENVIRONMENT'],
    env['GULL_WORKER_VERSION'],
    env['GULL_MAP_VERSION'],
  ].join('||');
}

function getHandler(
  env: Record<string, unknown>
): ReturnType<typeof createWorkerHandler> {
  const fp = envFingerprint(env);
  if (!handler || fp !== cachedEnvFingerprint) {
    const { workerVersion, mapVersion } = resolveVersions(env, {
      worker: DEFAULT_WORKER_VERSION,
      map: DEFAULT_MAP_VERSION,
    });
    handler = createWorkerHandler({
      mappingData: mappingData as unknown as readonly MappingRecord[],
      workerVersion,
      mapVersion,
      environment: inferEnvironment(env),
    });
    cachedEnvFingerprint = fp;
  }
  return handler;
}

// Cloudflare's ExecutionContext type comes from @cloudflare/workers-types.
// Define a minimal structural type here to avoid relying on ambient any.
interface CFExecutionContext {
  readonly waitUntil: (promise: Promise<unknown>) => void;
  readonly passThroughOnException?: () => void;
}

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: CFExecutionContext
  ): Promise<Response> {
    return getHandler(env).fetch(request, env, ctx);
  },
};

// Test-only reset utility (not documented or used in production).
export function __resetForTests(): void {
  handler = null;
  cachedEnvFingerprint = null;
}
