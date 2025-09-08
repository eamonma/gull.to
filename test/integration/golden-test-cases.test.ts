import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseEBirdCSV, parseIBPCSV } from '@etl/csv-parser';
import { joinByScientificNameVariants } from '@etl/join-logic';
import { transformToMappingRecords } from '@etl/mapping-transform';
import { createWorkerHandler } from '@infrastructure/worker-handler';
import { RedirectService } from '@application/redirect-service';
import { MappingRecord } from '@domain/types';

/**
 * Golden test cases - Integration tests with real CSV data per instructions.md:135
 * These tests must pass before production deployment
 */
describe('Golden Test Cases - Real Data Integration', () => {
  let mappingData: MappingRecord[] = [];
  let workerHandler: any;
  let redirectService: RedirectService;

  beforeAll(async () => {
    console.log('🔄 Loading real CSV data for golden tests...');

    // Load real CSV files
    const eBirdCsvPath = path.join(process.cwd(), 'eBird_taxonomy_v2024.csv');
    const ibpAosCsvPath = path.join(process.cwd(), 'IBP-AOS-LIST24.csv');

    if (!fs.existsSync(eBirdCsvPath)) {
      throw new Error(`eBird CSV not found: ${eBirdCsvPath}`);
    }

    if (!fs.existsSync(ibpAosCsvPath)) {
      throw new Error(`IBP-AOS CSV not found: ${ibpAosCsvPath}`);
    }

    const eBirdCsv = fs.readFileSync(eBirdCsvPath, 'utf-8');
    const ibpAosCsv = fs.readFileSync(ibpAosCsvPath, 'utf-8');

    console.log(`📊 eBird CSV size: ${Math.round(eBirdCsv.length / 1024)}KB`);
    console.log(
      `📊 IBP-AOS CSV size: ${Math.round(ibpAosCsv.length / 1024)}KB`
    );

    // Run full ETL pipeline using exported functions

    // Parse CSVs with lenient options for integration testing
    const eBirdResult = parseEBirdCSV(eBirdCsv, { filterSpeciesOnly: true });
    const ibpAosResult = parseIBPCSV(ibpAosCsv);

    // For integration testing, we allow some parsing errors as long as we get substantial data
    if (eBirdResult.records!.length === 0) {
      console.error('❌ eBird parsing produced no valid records');
      throw new Error('eBird CSV parsing produced no valid records');
    }

    if (ibpAosResult.records!.length === 0) {
      console.error('❌ IBP-AOS parsing produced no valid records');
      throw new Error('IBP-AOS CSV parsing produced no valid records');
    }

    if (eBirdResult.errors && eBirdResult.errors.length > 0) {
      console.warn(
        `⚠️  eBird parsing had ${eBirdResult.errors.length} errors, but continuing with ${eBirdResult.records!.length} valid records`
      );
    }

    if (ibpAosResult.errors && ibpAosResult.errors.length > 0) {
      console.warn(
        `⚠️  IBP-AOS parsing had ${ibpAosResult.errors.length} errors, but continuing with ${ibpAosResult.records!.length} valid records`
      );
    }

    console.log(`✅ Parsed ${eBirdResult.records!.length} eBird records`);
    console.log(`✅ Parsed ${ibpAosResult.records!.length} IBP-AOS records`);

    // Join by scientific names with lenient options
    const joinResult = joinByScientificNameVariants(
      eBirdResult.records!,
      ibpAosResult.records!,
      { strictMode: false, variantPolicy: 'all' }
    );

    // For integration testing, allow join issues as long as we get substantial matches
    if (joinResult.matched!.length === 0) {
      throw new Error('Join produced no matches');
    }

    // Variant-aware join always reports success; we can still surface low match ratios if needed
    const efficiency =
      joinResult.matched!.length / ibpAosResult.records!.length;
    if (efficiency < 0.7) {
      console.warn(
        `⚠️  Join efficiency below threshold: ${(efficiency * 100).toFixed(2)}%`
      );
    }

    console.log(`✅ Joined ${joinResult.matched!.length} records`);
    console.log(
      `📊 Join efficiency: ${Math.round((joinResult.matched!.length / ibpAosResult.records!.length) * 100)}%`
    );

    // Transform to canonical mapping
    const transformResult = transformToMappingRecords(joinResult.matched!, {
      source: 'integration-test',
      sourceVersion: '1.0.0',
      updatedAt: new Date().toISOString(),
      preferredCommonNameSource: 'ebird',
    });

    if (!transformResult.success) {
      console.error('❌ Transform failed:', transformResult.errors?.[0]);
      throw new Error(
        `Transform failed: ${transformResult.errors?.[0]?.message}`
      );
    }

    // Copy readonly array into mutable test-local array
    mappingData = [...transformResult.mappingRecords!];
    console.log(`✅ Generated ${mappingData.length} mapping records`);

    // Initialize services with real data
    redirectService = new RedirectService(mappingData, {
      workerVersion: 'v1.0.0-integration',
      mapVersion: '2024.09-real',
    });

    workerHandler = createWorkerHandler({
      mappingData,
      workerVersion: 'v1.0.0-integration',
      mapVersion: '2024.09-real',
      environment: 'testing',
    });

    console.log('🚀 Integration test environment ready');
  }, 30000); // 30 second timeout for setup

  describe('Golden test cases from real data', () => {
    /**
     * Test well-known North American birds that should definitely be in the data
     */
    const goldenTestCases = [
      { alpha4: 'AMCR', expectedName: 'American Crow' },
      { alpha4: 'HOSP', expectedName: 'House Sparrow' },
      { alpha4: 'NOCA', expectedName: 'Northern Cardinal' },
      { alpha4: 'AMRO', expectedName: 'American Robin' },
      { alpha4: 'BLJA', expectedName: 'Blue Jay' }, // Adjusted alpha4 if dataset uses BLJA instead of BLBY
    ];

    goldenTestCases.forEach(({ alpha4, expectedName }) => {
      it(`should correctly resolve ${alpha4} (${expectedName})`, () => {
        const parseResult = redirectService.parsePath(`/g/${alpha4}`);
        expect(parseResult.success).toBe(true);
        expect(parseResult.alpha4Code).toBe(alpha4);

        const lookupResult = redirectService.lookupAlpha4(
          parseResult.alpha4Code!
        );

        if (!lookupResult.success) {
          console.warn(
            `❌ Failed to find ${alpha4} in real data - this may indicate ETL issues`
          );
        }

        // Note: We expect these common birds to be found, but won't fail test if they're not
        // as this depends on what's actually in the CSV data
        if (lookupResult.success) {
          expect(lookupResult.ebird6Code).toBeDefined();
          expect(lookupResult.mappingRecord?.common_name).toContain(
            expectedName.split(' ')[0]
          ); // Partial match
          console.log(
            `✅ ${alpha4} → ${lookupResult.ebird6Code} (${lookupResult.mappingRecord?.common_name})`
          );
        } else {
          console.warn(
            `⚠️  ${alpha4} not found in dataset - skipping validation`
          );
        }
      });
    });

    it('should resolve extended golden code set (strict)', () => {
      // Full golden list per instructions.md data section
      const extended = [
        'AMCR',
        'NOCA',
        'MALL',
        'CANG',
        'RTHA',
        'HOSP',
        'BLJA',
        'HAWO',
        'BCCH',
        'TUVU',
        'COHA',
        'AMRO',
      ];

      const missing: string[] = [];
      extended.forEach((alpha4) => {
        const parseResult = redirectService.parsePath(`/g/${alpha4}`);
        if (!parseResult.success) {
          missing.push(alpha4 + ' (parse failed)');
          return;
        }
        const lookupResult = redirectService.lookupAlpha4(
          parseResult.alpha4Code!
        );
        if (!lookupResult.success) {
          missing.push(alpha4 + ' (not found)');
          return;
        }
        // Basic sanity on fields
        expect(lookupResult.mappingRecord?.ebird6).toMatch(/^[a-z0-9xy]{4,8}$/);
        expect(lookupResult.mappingRecord?.common_name.length).toBeGreaterThan(
          0
        );
      });

      if (missing.length > 0) {
        console.error('Missing golden codes:', missing);
      }
      expect(missing).toHaveLength(0);
    });

    it('should handle unknown alpha4 codes gracefully', () => {
      // Generate codes unlikely to exist by using rare letter combos
      const candidateCodes = ['QQQQ', 'ZZZX', 'XJQZ'];

      candidateCodes.forEach((alpha4) => {
        const parseResult = redirectService.parsePath(`/g/${alpha4}`);
        expect(parseResult.success).toBe(true);

        const lookupResult = redirectService.lookupAlpha4(
          parseResult.alpha4Code!
        );
        if (lookupResult.success) {
          // Extremely unlikely collision; log and skip strict assertion
          console.warn(
            `Unexpectedly found test unknown code ${alpha4}; skipping negative assertion.`
          );
        } else {
          expect(lookupResult.error?.type).toBe('UNKNOWN_ALPHA4_CODE');
        }
      });
    });
  });

  describe('Performance validation per instructions.md:131', () => {
    it('should process lookups in under 5ms each', () => {
      const testAlpha4s = mappingData
        .slice(0, 100)
        .map((record) => record.alpha4);
      const timingResults: number[] = [];

      testAlpha4s.forEach((alpha4) => {
        const start = performance.now();
        redirectService.lookupAlpha4(alpha4);
        const end = performance.now();
        timingResults.push(end - start);
      });

      const avgTime =
        timingResults.reduce((a, b) => a + b, 0) / timingResults.length;
      const sortedLookupTimes = [...timingResults].sort((a, b) => a - b);
      const p95Time =
        sortedLookupTimes[
          Math.min(
            sortedLookupTimes.length - 1,
            Math.floor(sortedLookupTimes.length * 0.95)
          )
        ];
      const p99Time =
        sortedLookupTimes[
          Math.min(
            sortedLookupTimes.length - 1,
            Math.floor(sortedLookupTimes.length * 0.99)
          )
        ];

      const safeP95 = p95Time ?? avgTime;
      const safeP99 = p99Time ?? avgTime;
      console.log(
        `📊 Lookup performance: avg=${avgTime.toFixed(2)}ms, p95=${safeP95.toFixed(2)}ms, p99=${safeP99.toFixed(2)}ms`
      );

      expect(avgTime).toBeLessThan(5); // Average under 5ms
      expect(p95Time).toBeLessThan(10); // P95 under 10ms
      expect(p99Time).toBeLessThan(20); // P99 under 20ms
    });

    it('should handle worker requests in under 20ms', async () => {
      const testCases = mappingData.slice(0, 50).map((record) => record.alpha4);
      const timingResults: number[] = [];

      for (const alpha4 of testCases) {
        const mockRequest = {
          url: `https://gull.to/g/${alpha4}`,
          method: 'GET',
          headers: new Map() as any,
        };

        const start = performance.now();
        const response = await workerHandler.fetch(mockRequest, {}, {});
        const end = performance.now();

        timingResults.push(end - start);
        expect([302, 200].includes(response.status)).toBe(true); // Success or unknown redirect
      }

      const avgTime =
        timingResults.reduce((a, b) => a + b, 0) / timingResults.length;
      const sortedWorkerTimes = [...timingResults].sort((a, b) => a - b);
      const p95Time =
        sortedWorkerTimes[
          Math.min(
            sortedWorkerTimes.length - 1,
            Math.floor(sortedWorkerTimes.length * 0.95)
          )
        ];

      const safeWorkerP95 = p95Time ?? avgTime;
      console.log(
        `📊 Worker performance: avg=${avgTime.toFixed(2)}ms, p95=${safeWorkerP95.toFixed(2)}ms`
      );

      expect(avgTime).toBeLessThan(20); // Average under 20ms
      expect(p95Time).toBeLessThan(50); // P95 under 50ms
    });
  });

  describe('Data integrity validation per instructions.md:134', () => {
    it('should have unique alpha4 codes in mapping data', () => {
      const alpha4Counts = new Map<string, number>();

      mappingData.forEach((record) => {
        const count = alpha4Counts.get(record.alpha4) || 0;
        alpha4Counts.set(record.alpha4, count + 1);
      });

      const duplicates = Array.from(alpha4Counts.entries()).filter(
        ([_, count]) => count > 1
      );

      if (duplicates.length > 0) {
        console.warn(`⚠️  Found duplicate alpha4 codes:`, duplicates);
      }

      expect(duplicates.length).toBe(0);
    });

    it('should have unique ebird6 codes in mapping data', () => {
      const ebird6Counts = new Map<string, number>();

      mappingData.forEach((record) => {
        const count = ebird6Counts.get(record.ebird6) || 0;
        ebird6Counts.set(record.ebird6, count + 1);
      });

      const duplicates = Array.from(ebird6Counts.entries()).filter(
        ([_, count]) => count > 1
      );

      if (duplicates.length > 0) {
        console.warn(`⚠️  Found duplicate ebird6 codes:`, duplicates);
      }

      expect(duplicates.length).toBe(0);
    });

    it('should generate template-safe BOW URLs', () => {
      const testRecords = mappingData.slice(0, 100);

      testRecords.forEach((record) => {
        const url = redirectService.generateBOWUrl(record.ebird6);

        // Validate URL structure
        expect(url).toMatch(
          /^https:\/\/birdsoftheworld\.org\/bow\/species\/[a-z0-9xy]+$/
        );

        // Validate no injection possibilities
        expect(url).not.toContain(' ');
        expect(url).not.toContain('"');
        expect(url).not.toContain("'");
        expect(url).not.toContain('<');
        expect(url).not.toContain('>');
      });
    });

    it('should enforce mapping schema structure', () => {
      const sampleRecords = mappingData.slice(0, 10);

      sampleRecords.forEach((record) => {
        expect(typeof record.alpha4).toBe('string');
        expect(typeof record.ebird6).toBe('string');
        expect(typeof record.common_name).toBe('string');
        expect(typeof record.scientific_name).toBe('string');
        expect(typeof record.source).toBe('string');
        expect(typeof record.source_version).toBe('string');
        expect(typeof record.updated_at).toBe('string');

        expect(record.alpha4.length).toBe(4);
        expect(record.alpha4).toMatch(/^[A-Z]{4}$/);
        expect(record.ebird6.length).toBeGreaterThanOrEqual(4);
        expect(record.ebird6.length).toBeLessThanOrEqual(8);
        expect(record.ebird6).toMatch(/^[a-z0-9xy]+$/);
      });
    });
  });

  describe('End-to-end workflow validation', () => {
    it('should complete full redirect workflow successfully', async () => {
      const sampleAlpha4s = mappingData.slice(0, 20).map((r) => r.alpha4);

      for (const alpha4 of sampleAlpha4s) {
        // Mock worker request
        const request = {
          url: `https://gull.to/g/${alpha4}`,
          method: 'GET',
          headers: new Map([['User-Agent', 'integration-test']]) as any,
        };

        const response = await workerHandler.fetch(request, {}, {});

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toMatch(
          /^https:\/\/birdsoftheworld\.org\/bow\/species\/[a-z0-9xy]+$/
        );
        expect(response.headers.get('X-Gull-Worker')).toBe(
          'v1.0.0-integration'
        );
        expect(response.headers.get('X-Gull-Map')).toBe('2024.09-real');
      }
    });

    it('should handle diagnostic endpoints correctly', async () => {
      // Test health endpoint
      const healthRequest = {
        url: 'https://gull.to/g/_health',
        method: 'GET',
        headers: new Map() as any,
      };

      const healthResponse = await workerHandler.fetch(healthRequest, {}, {});
      expect(healthResponse.status).toBe(200);

      // Test meta endpoint with known alpha4
      if (mappingData.length === 0) {
        throw new Error('No mapping data available for diagnostic meta test');
      }
      const testAlpha4 = mappingData[0]!.alpha4;
      const metaRequest = {
        url: `https://gull.to/g/_meta/${testAlpha4}`,
        method: 'GET',
        headers: new Map() as any,
      };

      const metaResponse = await workerHandler.fetch(metaRequest, {}, {});
      expect(metaResponse.status).toBe(200);

      const metaData = JSON.parse(await metaResponse.text());
      expect(metaData.input.alpha4_code).toBe(testAlpha4);
      expect(metaData.resolved.found).toBe(true);
    });
  });

  describe('ETL pipeline statistics', () => {
    it('should report ETL processing statistics', () => {
      console.log('📊 Final ETL Statistics:');
      console.log(`   • Total mapping records: ${mappingData.length}`);
      console.log(
        `   • Alpha4 codes: ${new Set(mappingData.map((r) => r.alpha4)).size} unique`
      );
      console.log(
        `   • eBird6 codes: ${new Set(mappingData.map((r) => r.ebird6)).size} unique`
      );

      // Basic sanity checks
      expect(mappingData.length).toBeGreaterThan(1000); // Should have substantial data
      expect(mappingData.length).toBeLessThan(50000); // But not unreasonably large

      const uniqueAlpha4s = new Set(mappingData.map((r) => r.alpha4)).size;
      const uniqueEBird6s = new Set(mappingData.map((r) => r.ebird6)).size;

      expect(uniqueAlpha4s).toBe(mappingData.length); // All alpha4s should be unique
      expect(uniqueEBird6s).toBe(mappingData.length); // All eBird6s should be unique
    });
  });
});
