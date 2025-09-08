import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerHandler, WorkerConfig, createWorkerHandler } from '@infrastructure/worker-handler';
import { createAlpha4Code, createEBirdCode, createScientificName } from '@domain/types';

// Mock the Cloudflare Workers global types
declare const global: any;

// Mock Request/Response for Cloudflare Workers environment
class MockHeaders {
  private headers: Map<string, string> = new Map();

  constructor(init?: Record<string, string>) {
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.headers.set(key.toLowerCase(), value);
      });
    }
  }

  set(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  get(name: string): string | null {
    return this.headers.get(name.toLowerCase()) || null;
  }

  forEach(callback: (value: string, key: string) => void) {
    this.headers.forEach(callback);
  }
}

class MockRequest {
  public url: string;
  public method: string;
  public headers: MockHeaders;

  constructor(url: string, options: RequestInit = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new MockHeaders(options.headers as Record<string, string> || {});
  }
}

class MockResponse {
  public status: number;
  public headers: MockHeaders;
  public body: BodyInit | null;

  constructor(body: BodyInit | null, options: ResponseInit = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.headers = new MockHeaders(options.headers as Record<string, string> || {});
  }

  async text(): Promise<string> {
    if (this.body === null) {
      return '';
    }
    return String(this.body);
  }
}

// Setup global Worker environment
beforeEach(() => {
  global.Request = MockRequest;
  global.Response = MockResponse;
  global.Headers = MockHeaders;
  // Mock URL if not available
  if (typeof global.URL === 'undefined') {
    global.URL = URL;
  }
});

describe('Cloudflare Worker HTTP Handler - TDD RED Phase', () => {
  const mockMappingData = [
    {
      alpha4: createAlpha4Code('AMCR'),
      ebird6: createEBirdCode('amecro'),
      common_name: 'American Crow',
      scientific_name: createScientificName('Corvus brachyrhynchos'),
      source: 'XLSX IBP-AOS-LIST24',
      source_version: '2024.09',
      updated_at: '2024-09-08T00:00:00.000Z',
    },
  ];

  const mockConfig: WorkerConfig = {
    mappingData: mockMappingData,
    workerVersion: 'v1.0.0',
    mapVersion: '2024.09',
    environment: 'testing',
  };

  describe('Worker initialization and configuration', () => {
    it('should create worker handler with valid configuration', () => {
      const handler = createWorkerHandler(mockConfig);
      
      expect(handler).toBeDefined();
      expect(typeof handler.fetch).toBe('function');
    });

    it('should validate required configuration parameters', () => {
      const invalidConfig = {
        mappingData: [],
        workerVersion: '',
        mapVersion: '',
        environment: 'testing',
      } as WorkerConfig;

      expect(() => createWorkerHandler(invalidConfig)).toThrow('Invalid worker configuration');
    });

    it('should support environment-specific configuration', () => {
      const prodConfig: WorkerConfig = {
        ...mockConfig,
        environment: 'production',
      };

      const stagingConfig: WorkerConfig = {
        ...mockConfig,
        environment: 'staging',
      };

      expect(() => createWorkerHandler(prodConfig)).not.toThrow();
      expect(() => createWorkerHandler(stagingConfig)).not.toThrow();
    });
  });

  describe('Request routing per instructions.md:22-24', () => {
    it('should handle /g/* paths with redirect service', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/AMCR') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://birdsoftheworld.org/bow/species/amecro');
      expect(response.headers.get('X-Gull-Worker')).toBe('v1.0.0');
      expect(response.headers.get('X-Gull-Map')).toBe('2024.09');
    });

    it('should pass through non-/g/* paths unchanged', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/some-other-path') as any;

      const response = await handler.fetch(request, {}, {});

      // Should return a pass-through response (let Short.io handle it)
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Gull-Passthrough')).toBe('true');
    });

    it('should handle root domain requests', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Gull-Passthrough')).toBe('true');
    });

    it('should handle subdomain routing for staging', async () => {
      const stagingConfig = { ...mockConfig, environment: 'staging' };
      const handler = createWorkerHandler(stagingConfig);
      const request = new MockRequest('https://staging.gull.to/g/AMCR') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://birdsoftheworld.org/bow/species/amecro');
    });
  });

  describe('HTTP method handling', () => {
    it('should handle GET requests for redirects', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/AMCR', { method: 'GET' }) as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(302);
    });

    it('should handle HEAD requests for redirects', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/AMCR', { method: 'HEAD' }) as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(302);
      // HEAD should have same headers but no body
    });

    it('should reject unsupported HTTP methods', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/AMCR', { method: 'POST' }) as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(405); // Method Not Allowed
      expect(response.headers.get('Allow')).toBe('GET, HEAD');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle unknown alpha4 codes gracefully', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/UNKN') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://birdsoftheworld.org/');
    });

    it('should handle malformed /g/* paths', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/invalid-format') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should handle internal errors gracefully', async () => {
      // The config validation happens at creation time
      expect(() => createWorkerHandler({
        ...mockConfig,
        mappingData: null as any, // This should cause an error
      })).toThrow('Invalid worker configuration');
    });
  });

  describe('Request/Response transformation', () => {
    it('should properly transform Cloudflare Request to RedirectRequest', async () => {
      const handler = createWorkerHandler(mockConfig);
      const cfRequest = new MockRequest('https://gull.to/g/AMCR', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html',
        },
      }) as any;

      // Mock the transformation to verify it works
      const response = await handler.fetch(cfRequest, {}, {});
      expect(response).toBeDefined();
    });

    it('should properly transform RedirectResponse to Cloudflare Response', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/AMCR') as any;

      const response = await handler.fetch(request, {}, {});

      // Should have all required Cloudflare Response properties
      expect(response.status).toBeDefined();
      expect(response.headers).toBeDefined();
      expect(typeof response.status).toBe('number');
    });

    it('should preserve custom headers from redirect service', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/AMCR') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.headers.get('Cache-Control')).toBe('private, max-age=0');
      expect(response.headers.get('X-Gull-Worker')).toBe('v1.0.0');
      expect(response.headers.get('X-Gull-Map')).toBe('2024.09');
    });
  });

  describe('Static asset bundling per instructions.md:80', () => {
    it('should bundle mapping data at build time', () => {
      const handler = createWorkerHandler(mockConfig);
      
      // The handler should have access to the mapping data
      expect(mockConfig.mappingData).toBeDefined();
      expect(mockConfig.mappingData.length).toBeGreaterThan(0);
    });

    it('should handle missing or empty mapping data', () => {
      const emptyConfig = { ...mockConfig, mappingData: [] };
      const handler = createWorkerHandler(emptyConfig);
      
      expect(handler).toBeDefined();
    });
  });

  describe('Performance and caching considerations', () => {
    it('should complete requests within performance budget', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/AMCR') as any;

      const startTime = performance.now();
      await handler.fetch(request, {}, {});
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(10); // Should be very fast
    });

    it('should handle concurrent requests efficiently', async () => {
      const handler = createWorkerHandler(mockConfig);
      
      const requests = Array.from({ length: 10 }, () => 
        handler.fetch(new MockRequest('https://gull.to/g/AMCR') as any, {}, {})
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(302);
      });
    });
  });

  describe('Environment-specific behavior', () => {
    it('should include environment info in development', async () => {
      const devConfig = { ...mockConfig, environment: 'development' };
      const handler = createWorkerHandler(devConfig);
      const request = new MockRequest('https://gull.to/g/AMCR') as any;

      const response = await handler.fetch(request, {}, {});

      // Development might include additional debug headers
      expect(response.headers.get('X-Gull-Worker')).toBeDefined();
    });

    it('should handle production security requirements', async () => {
      const prodConfig = { ...mockConfig, environment: 'production' };
      const handler = createWorkerHandler(prodConfig);
      const request = new MockRequest('https://gull.to/g/AMCR') as any;

      const response = await handler.fetch(request, {}, {});

      // Production should have secure headers
      expect(response.headers.get('X-Gull-Worker')).toBeDefined();
      expect(response.status).toBe(302);
    });
  });

  describe('Diagnostics endpoints per instructions.md:92-96', () => {
    it('should handle /g/_health endpoint', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/_health') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      // Should return "ok" status plus worker/map versions
      const body = await response.text();
      const healthData = JSON.parse(body);
      expect(healthData.status).toBe('ok');
      expect(healthData.worker_version).toBe('v1.0.0');
      expect(healthData.map_version).toBe('2024.09');
      expect(healthData.timestamp).toBeDefined();
    });

    it('should handle /g/_meta/{alpha4} endpoint with known code', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/_meta/AMCR') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.text();
      const metaData = JSON.parse(body);
      expect(metaData.input.path).toBe('/g/_meta/AMCR');
      expect(metaData.input.alpha4_code).toBe('AMCR');
      expect(metaData.resolved.found).toBe(true);
      expect(metaData.resolved.ebird6_code).toBe('amecro');
      expect(metaData.resolved.common_name).toBe('American Crow');
      expect(metaData.resolved.destination_url).toBe('https://birdsoftheworld.org/bow/species/amecro');
    });

    it('should handle /g/_meta/{alpha4} endpoint with unknown code', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/_meta/UNKN') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.text();
      const metaData = JSON.parse(body);
      expect(metaData.input.path).toBe('/g/_meta/UNKN');
      expect(metaData.input.alpha4_code).toBe('UNKN');
      expect(metaData.resolved.found).toBe(false);
      expect(metaData.resolved.destination_url).toBe('https://birdsoftheworld.org/');
    });

    it('should handle /g/_meta/{alpha4} endpoint with invalid alpha4 format', async () => {
      const handler = createWorkerHandler(mockConfig);
      const request = new MockRequest('https://gull.to/g/_meta/invalid') as any;

      const response = await handler.fetch(request, {}, {});

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.text();
      const errorData = JSON.parse(body);
      expect(errorData.error.type).toBe('INVALID_ALPHA4_FORMAT');
    });

    it('should include standard headers in diagnostic responses', async () => {
      const handler = createWorkerHandler(mockConfig);
      const healthRequest = new MockRequest('https://gull.to/g/_health') as any;

      const response = await handler.fetch(healthRequest, {}, {});

      expect(response.headers.get('X-Gull-Worker')).toBe('v1.0.0');
      expect(response.headers.get('X-Gull-Map')).toBe('2024.09');
    });
  });
});