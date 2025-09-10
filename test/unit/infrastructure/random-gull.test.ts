import { describe, it, expect, beforeEach } from 'vitest';
import { createWorkerHandler, WorkerConfig } from '@infrastructure/worker-handler';
import { createAlpha4Code, createEBirdCode, createScientificName } from '@domain/types';

// Reuse mock request/response classes similar to worker-handler.test setup
class MockHeaders {
  private headers: Map<string, string> = new Map();
  constructor(init?: Record<string, string>) {
    if (init) Object.entries(init).forEach(([k, v]) => this.headers.set(k.toLowerCase(), v));
  }
  set(name: string, value: string) { this.headers.set(name.toLowerCase(), value); }
  get(name: string): string | null { return this.headers.get(name.toLowerCase()) || null; }
  forEach(cb: (value: string, key: string) => void) { this.headers.forEach(cb); }
}
class MockRequest {
  public url: string; public method: string; public headers: MockHeaders;
  constructor(url: string, options: RequestInit = {}) {
    this.url = url; this.method = options.method || 'GET'; this.headers = new MockHeaders(options.headers as any);
  }
}
class MockResponse {
  public status: number; public headers: MockHeaders; public body: BodyInit | null;
  constructor(body: BodyInit | null, options: ResponseInit = {}) {
    this.body = body; this.status = options.status || 200; this.headers = new MockHeaders(options.headers as any);
  }
  async text(): Promise<string> { return this.body === null ? '' : String(this.body); }
}

beforeEach(() => {
  (global as any).Request = MockRequest;
  (global as any).Response = MockResponse;
  (global as any).Headers = MockHeaders;
  if (typeof (global as any).URL === 'undefined') (global as any).URL = URL;
});

describe('Random Gull endpoint /g/_random_gull', () => {
  const gullMappingData = [
    {
      alpha4: createAlpha4Code('RBGU'),
      ebird6: createEBirdCode('ribgul'),
      common_name: 'Ring-billed Gull',
      scientific_name: createScientificName('Larus delawarensis'),
      source: 'XLSX IBP-AOS-LIST24',
      source_version: '2024.09',
      updated_at: '2024-09-08T00:00:00.000Z',
    },
    {
      alpha4: createAlpha4Code('HERG'),
      ebird6: createEBirdCode('hergul'),
      common_name: 'Herring Gull',
      scientific_name: createScientificName('Larus argentatus'),
      source: 'XLSX IBP-AOS-LIST24',
      source_version: '2024.09',
      updated_at: '2024-09-08T00:00:00.000Z',
    },
    {
      alpha4: createAlpha4Code('AMCR'),
      ebird6: createEBirdCode('amecro'),
      common_name: 'American Crow', // Non-gull should never be chosen
      scientific_name: createScientificName('Corvus brachyrhynchos'),
      source: 'XLSX IBP-AOS-LIST24',
      source_version: '2024.09',
      updated_at: '2024-09-08T00:00:00.000Z',
    },
  ];

  const baseConfig: WorkerConfig = {
    mappingData: gullMappingData,
    workerVersion: 'v1.2.3',
    mapVersion: '2024.09',
    environment: 'testing',
  };

  it('returns 302 redirect to a gull species page', async () => {
    const handler = createWorkerHandler(baseConfig);
    const request = new MockRequest('https://gull.to/g/_random_gull') as any;
    const response = await handler.fetch(request, {}, {});
    expect(response.status).toBe(302);
    const location = response.headers.get('Location');
    expect(location).toBeTruthy();
    expect(/https:\/\/birdsoftheworld.org\/bow\/species\//.test(location!)).toBe(true);
    // Ensure not redirecting to a non-gull species (amecro)
    expect(location!.includes('amecro')).toBe(false);
  });

  it('only ever redirects to gull species across multiple calls', async () => {
    const handler = createWorkerHandler(baseConfig);
    const attempts = 10;
    for (let i = 0; i < attempts; i++) {
      const response = await handler.fetch(new MockRequest('https://gull.to/g/_random_gull') as any, {}, {});
      expect(response.status).toBe(302);
      const location = response.headers.get('Location')!;
      expect(location.includes('ribgul') || location.includes('hergul')).toBe(true);
      expect(location.includes('amecro')).toBe(false);
    }
  });

  it('returns 500 when no gull species exist in mapping', async () => {
    const noGullConfig: WorkerConfig = {
      ...baseConfig,
      mappingData: [gullMappingData[2]!], // only crow
    };
    const handler = createWorkerHandler(noGullConfig);
    const response = await handler.fetch(new MockRequest('https://gull.to/g/_random_gull') as any, {}, {});
    expect(response.status).toBe(500);
    const body = await response.text();
    const json = JSON.parse(body || '{}');
    expect(json.error.type).toBeDefined();
  });
});
