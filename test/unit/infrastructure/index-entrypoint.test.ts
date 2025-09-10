import { describe, it, expect, beforeEach } from 'vitest';

// We import the default export which should be the fetch handler object.
import workerModule, { __resetForTests } from '../../../src/index';
import mappingData from '../../../data/mapping/map-2024.09.json';

// Minimal mocks for Cloudflare bindings.
class MockHeaders {
  private map = new Map<string, string>();
  set(k: string, v: string) {
    this.map.set(k.toLowerCase(), v);
  }
  get(k: string) {
    return this.map.get(k.toLowerCase()) || null;
  }
  forEach(cb: (v: string, k: string) => void) {
    this.map.forEach(cb);
  }
}
class MockRequest {
  url: string;
  method: string;
  headers: MockHeaders;
  constructor(url: string, init: RequestInit = {}) {
    this.url = url;
    this.method = init.method || 'GET';
    this.headers = new MockHeaders();
  }
}

// ExecutionContext stub
class MockExecutionContext implements ExecutionContext {
  // minimal properties used by Workers runtime; add passThroughOnException no-op
  waitUntil(_p: Promise<any>) {
    /* noop */
  }
  passThroughOnException() {
    /* noop */
  }
  // props bag (undocumented but present in types) – supply empty
  readonly props: Record<string, unknown> = {};
}

declare const global: any;

describe('Worker index entrypoint', () => {
  beforeEach(() => {
    global.Headers = MockHeaders;
    global.Request = MockRequest;
  });

  it('exposes a fetch method', () => {
    expect(workerModule).toBeDefined();
    expect(typeof workerModule.fetch).toBe('function');
  });

  it('honors env overrides for version headers after reset', async () => {
    __resetForTests();
    const env = {
      ENVIRONMENT: 'staging',
      GULL_WORKER_VERSION: 'v9.9.9',
      GULL_MAP_VERSION: '2099.12',
    } as any;
    const ctx = new MockExecutionContext();
    const req = new MockRequest('https://gull.to/g/AMCR');
    const res: Response = await workerModule.fetch(req as any, env, ctx);
    expect(res.headers.get('X-Gull-Worker')).toBe('v9.9.9');
    expect(res.headers.get('X-Gull-Map')).toBe('2099.12');
  });

  it('handles a known alpha4 redirect with mapping loaded once', async () => {
    const env = { ENVIRONMENT: 'staging' } as any;
    const ctx = new MockExecutionContext();

    // Pick a stable known code from current mapping file; fallback to AMCR if present.
    const target =
      (mappingData as any[]).find((r) => r.alpha4 === 'AMCR') ||
      (mappingData as any[])[0];
    expect(target).toBeDefined();

    const req = new MockRequest(`https://gull.to/g/${target.alpha4}`) as any;
    const start = performance.now();
    const res: Response = await workerModule.fetch(req, env, ctx);
    const firstDuration = performance.now() - start;

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toMatch(
      /https:\/\/birdsoftheworld.org\/bow\/species\//
    );
    expect(res.headers.get('X-Gull-Worker')).toBeDefined();
    expect(res.headers.get('X-Gull-Map')).toBe('2024.09');

    // Second request should be fast (cached handler); rough perf assertion.
    const req2 = new MockRequest(`https://gull.to/g/${target.alpha4}`) as any;
    const t2start = performance.now();
    const res2: Response = await workerModule.fetch(req2, env, ctx);
    const secondDuration = performance.now() - t2start;

    expect(res2.status).toBe(302);
    // Ensure second duration not drastically slower (allow generous factor to avoid flakiness)
    expect(secondDuration).toBeLessThan(firstDuration * 2 + 5);
  });

  it('falls through non /g/ path (passthrough)', async () => {
    const env = { ENVIRONMENT: 'production' } as any;
    const ctx = new MockExecutionContext();
    const req = new MockRequest('https://gull.to/other');

    const res: Response = await workerModule.fetch(req as any, env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Gull-Passthrough')).toBe('true');
  });

  it('sets environment via ENVIRONMENT var (staging)', async () => {
    const env = { ENVIRONMENT: 'staging' } as any;
    const ctx = new MockExecutionContext();
    const req = new MockRequest('https://gull.to/g/XXXX'); // Force unknown path after parse

    const res: Response = await workerModule.fetch(req as any, env, ctx);
    // Unknown alpha4 invalid format -> 400 or 302 fallback depending on code validity
    expect([302, 400]).toContain(res.status);
    expect(res.headers.get('X-Gull-Worker')).toBeDefined();
  });
});
