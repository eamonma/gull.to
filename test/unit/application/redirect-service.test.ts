import { describe, it, expect } from 'vitest';
import {
  RedirectService,
  RedirectRequest,
  RedirectResponse,
  PathParseResult,
  LookupResult,
} from '@application/redirect-service';
import {
  MappingRecord,
  createAlpha4Code,
  createEBirdCode,
  createScientificName,
} from '@domain/types';

describe('Core Redirect Business Logic - TDD RED Phase', () => {
  const mockMappingData: MappingRecord[] = [
    {
      alpha4: createAlpha4Code('AMCR'),
      ebird6: createEBirdCode('amecro'),
      common_name: 'American Crow',
      scientific_name: createScientificName('Corvus brachyrhynchos'),
      source: 'XLSX IBP-AOS-LIST24',
      source_version: '2024.09',
      updated_at: '2024-09-08T00:00:00.000Z',
    },
    {
      alpha4: createAlpha4Code('MALL'),
      ebird6: createEBirdCode('mallad'),
      common_name: 'Mallard',
      scientific_name: createScientificName('Anas platyrhynchos'),
      source: 'XLSX IBP-AOS-LIST24',
      source_version: '2024.09',
      updated_at: '2024-09-08T00:00:00.000Z',
    },
  ];

  const redirectService = new RedirectService(mockMappingData, {
    workerVersion: 'v1.0.0',
    mapVersion: '2024.09',
  });

  describe('Path parsing per instructions.md:49-54', () => {
    it('should parse valid /g/{alpha4} paths', () => {
      const result = redirectService.parsePath('/g/AMCR');

      expect(result.success).toBe(true);
      expect(result.namespace).toBe('g');
      expect(result.alpha4Code).toBe('AMCR');
    });

    it('should normalize alpha4 codes to uppercase', () => {
      const result = redirectService.parsePath('/g/amcr');

      expect(result.success).toBe(true);
      expect(result.alpha4Code).toBe('AMCR'); // Normalized to uppercase
    });

    it('should ignore trailing slashes per instructions.md:53', () => {
      const result = redirectService.parsePath('/g/AMCR/');

      expect(result.success).toBe(true);
      expect(result.alpha4Code).toBe('AMCR');
    });

    it('should ignore query strings per instructions.md:53', () => {
      const result = redirectService.parsePath(
        '/g/AMCR?utm_source=test&ref=email'
      );

      expect(result.success).toBe(true);
      expect(result.alpha4Code).toBe('AMCR');
    });

    it('should reject invalid namespace paths', () => {
      const result = redirectService.parsePath('/x/AMCR');

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('INVALID_NAMESPACE');
    });

    it('should validate alpha4 format per instructions.md:58', () => {
      const invalidCodes = [
        '/g/AM1R', // Contains number
        '/g/amcr', // Would be normalized, but test lowercase handling
        '/g/TOOLONG', // Too long
        '/g/AM', // Too short
        '/g/', // Empty
      ];

      for (const path of invalidCodes) {
        const result = redirectService.parsePath(path);
        if (path === '/g/amcr') {
          expect(result.success).toBe(true); // Should be normalized
        } else {
          expect(result.success).toBe(false);
          expect(result.error?.type).toBe('INVALID_ALPHA4_FORMAT');
        }
      }
    });
  });

  describe('Alpha4 lookup resolution per instructions.md:62-66', () => {
    it('should resolve known alpha4 codes to eBird6 codes', () => {
      const result = redirectService.lookupAlpha4(createAlpha4Code('AMCR'));

      expect(result.success).toBe(true);
      expect(result.ebird6Code).toBe('amecro');
      expect(result.mappingRecord?.common_name).toBe('American Crow');
    });

    it('should handle unknown alpha4 codes per instructions.md:75', () => {
      const result = redirectService.lookupAlpha4(createAlpha4Code('UNKN'));

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('UNKNOWN_ALPHA4_CODE');
    });

    it('should provide lookup statistics for observability', () => {
      const knownResult = redirectService.lookupAlpha4(
        createAlpha4Code('AMCR')
      );
      const unknownResult = redirectService.lookupAlpha4(
        createAlpha4Code('UNKN')
      );

      expect(knownResult.success).toBe(true);
      expect(unknownResult.success).toBe(false);
    });
  });

  describe('BOW URL generation per instructions.md:65', () => {
    it('should generate correct BOW URLs from eBird6 codes', () => {
      const url = redirectService.generateBOWUrl(createEBirdCode('amecro'));

      expect(url).toBe('https://birdsoftheworld.org/bow/species/amecro');
    });

    it('should validate URL template safety', () => {
      const safeEBirdCodes = ['amecro', 'mallad', 'emu1', 'ostric2', 'x01059'];

      for (const code of safeEBirdCodes) {
        const url = redirectService.generateBOWUrl(createEBirdCode(code));
        expect(url).toMatch(
          /^https:\/\/birdsoftheworld\.org\/bow\/species\/[a-z0-9xy]+$/
        );
      }
    });

    it('should return BOW home for unknown codes per instructions.md:75', () => {
      const url = redirectService.generateBOWUrl(null); // Unknown case

      expect(url).toBe('https://birdsoftheworld.org/');
    });
  });

  describe('End-to-end redirect processing per instructions.md:68-73', () => {
    it('should process successful redirect requests', () => {
      const request: RedirectRequest = {
        path: '/g/AMCR',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.status).toBe(302);
      expect(response.headers['Location']).toBe(
        'https://birdsoftheworld.org/bow/species/amecro'
      );
      expect(response.headers['Cache-Control']).toBe('private, max-age=0');
    });

    it('should include version headers per instructions.md:87-88', () => {
      const request: RedirectRequest = {
        path: '/g/AMCR',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.headers['X-Gull-Worker']).toBe('v1.0.0');
      expect(response.headers['X-Gull-Map']).toBe('2024.09');
    });

    it('should handle unknown codes with fallback per instructions.md:75', () => {
      const request: RedirectRequest = {
        path: '/g/UNKN',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.status).toBe(302);
      expect(response.headers['Location']).toBe('https://birdsoftheworld.org/');
      expect(response.redirectType).toBe('unknown');
    });

    it('should handle invalid paths with appropriate errors', () => {
      const request: RedirectRequest = {
        path: '/x/INVALID',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.status).toBe(400);
      expect(response.error?.type).toBe('INVALID_NAMESPACE');
    });
  });

  describe('Response headers per instructions.md:70-71', () => {
    it('should use 302 temporary redirects', () => {
      const request: RedirectRequest = {
        path: '/g/AMCR',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.status).toBe(302); // Temporary redirect
    });

    it('should include private cache control headers', () => {
      const request: RedirectRequest = {
        path: '/g/AMCR',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.headers['Cache-Control']).toBe('private, max-age=0');
    });

    it('should include mandatory version headers', () => {
      const request: RedirectRequest = {
        path: '/g/MALL',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.headers['X-Gull-Worker']).toBeDefined();
      expect(response.headers['X-Gull-Map']).toBeDefined();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle malformed URLs gracefully', () => {
      const malformedPaths = [
        '',
        '/',
        '/g',
        '/g/',
        '/g/AMCR/extra/path/components',
      ];

      for (const path of malformedPaths) {
        const result = redirectService.parsePath(path);
        // Should either succeed (for valid normalized paths) or fail gracefully
        expect(typeof result.success).toBe('boolean');
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      }
    });

    it('should provide comprehensive error information', () => {
      const request: RedirectRequest = {
        path: '/invalid/path',
        method: 'GET',
        headers: {},
      };

      const response = redirectService.processRedirect(request);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.error?.message).toBeDefined();
      expect(response.error?.type).toBeDefined();
    });

    it('should handle empty mapping data', () => {
      const emptyService = new RedirectService([], {
        workerVersion: 'v1.0.0',
        mapVersion: '2024.09',
      });

      const result = emptyService.lookupAlpha4(createAlpha4Code('AMCR'));
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('UNKNOWN_ALPHA4_CODE');
    });
  });

  describe('Performance and caching considerations', () => {
    it('should perform lookups efficiently', () => {
      const startTime = performance.now();

      // Perform multiple lookups
      for (let i = 0; i < 100; i++) {
        redirectService.lookupAlpha4(createAlpha4Code('AMCR'));
        redirectService.lookupAlpha4(createAlpha4Code('MALL'));
        redirectService.lookupAlpha4(createAlpha4Code('UNKN'));
      }

      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
    });

    it('should maintain lookup statistics', () => {
      // Multiple lookups to generate stats
      redirectService.lookupAlpha4(createAlpha4Code('AMCR'));
      redirectService.lookupAlpha4(createAlpha4Code('MALL'));
      redirectService.lookupAlpha4(createAlpha4Code('UNKN'));

      const stats = redirectService.getStats();
      expect(stats.totalLookups).toBeGreaterThan(0);
      expect(stats.successfulLookups).toBeGreaterThan(0);
      expect(stats.unknownLookups).toBeGreaterThan(0);
    });
  });
});
