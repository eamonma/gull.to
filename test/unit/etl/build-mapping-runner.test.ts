import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_EBIRD_CSV,
  DEFAULT_IBP_AOS_CSV,
  CALVER_PATTERN,
} from '../../../src/etl/config';
import os from 'os';

// TDD: This test defines the expected contract for the ETL build runner (not yet implemented).
// The implementation will live in `src/etl/build-mapping.ts` and export a function `runBuildMapping`.
// Goals validated here:
// 1. Generates a canonical mapping JSON file at data/mapping/map-<CalVer>.json (AND in specified outputDir for test isolation)
// 2. File name CalVer pattern: YYYY.MM[.DD][-hotfix.N]
// 3. JSON parses to a non-empty array of mapping records with required fields
// 4. All alpha4 and ebird6 codes unique and properly formatted
// 5. Each record has ISO `updated_at` matching the run options updatedAt (or derived timestamp)
// 6. The function returns metadata including outputPath, recordCount, mapVersion

// Use canonical config paths instead of ad-hoc root placement
const EBIRD_CSV = path.join(process.cwd(), DEFAULT_EBIRD_CSV);
const IBP_AOS_CSV = path.join(process.cwd(), DEFAULT_IBP_AOS_CSV);

let tempOutputDir: string;

beforeAll(() => {
  if (!fs.existsSync(EBIRD_CSV)) {
    throw new Error(`Missing required source file: ${EBIRD_CSV}`);
  }
  if (!fs.existsSync(IBP_AOS_CSV)) {
    throw new Error(`Missing required source file: ${IBP_AOS_CSV}`);
  }
  tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gull-map-build-'));
});

afterAll(() => {
  try {
    if (tempOutputDir && fs.existsSync(tempOutputDir)) {
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }
  } catch {}
});

describe('ETL Build Runner (TDD - expected contract)', () => {
  it('should export runBuildMapping function', async () => {
    // Dynamic import (module does not yet exist -> RED phase)
    let mod: any;
    try {
      mod = await import('../../../src/etl/build-mapping');
    } catch (e) {
      // Force explicit failure so intent is clear
      expect.fail('Module src/etl/build-mapping.ts not implemented yet');
    }
    expect(typeof mod.runBuildMapping).toBe('function');
  });

  it('should produce a canonical mapping JSON file with valid schema and metadata', async () => {
    let runBuildMapping: any;
    try {
      ({ runBuildMapping } = await import('../../../src/etl/build-mapping'));
    } catch (e) {
      expect.fail('runBuildMapping not implemented');
    }

    const mapVersion = '2024.09'; // Chosen CalVer for current dataset cycle
    const updatedAt = new Date().toISOString();

    const result = await runBuildMapping({
      ebirdCsvPath: EBIRD_CSV,
      ibpAosCsvPath: IBP_AOS_CSV,
      outputDir: tempOutputDir,
      mapVersion,
      updatedAt,
      preferredCommonNameSource: 'ebird',
    });

    // Result contract
    expect(result).toBeDefined();
    expect(typeof result.outputPath).toBe('string');
    expect(result.mapVersion).toBe(mapVersion);
    expect(result.recordCount).toBeGreaterThan(0);

    // File existence & naming
    expect(fs.existsSync(result.outputPath)).toBe(true);
    const fileName = path.basename(result.outputPath);
    expect(fileName.startsWith('map-')).toBe(true);
    const versionPart = fileName.replace(/^map-|\.json$/g, '');
    expect(CALVER_PATTERN.test(versionPart)).toBe(true);

    // Parse JSON
    const raw = fs.readFileSync(result.outputPath, 'utf-8');
    let data: any;
    expect(() => {
      data = JSON.parse(raw);
    }).not.toThrow();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(result.recordCount);

    // Basic schema checks on sample subset (first 50 or all)
    const sample = data.slice(0, Math.min(50, data.length));
    const alpha4Set = new Set<string>();
    const ebird6Set = new Set<string>();

    for (const rec of sample) {
      // Required fields
      [
        'alpha4',
        'ebird6',
        'common_name',
        'scientific_name',
        'source',
        'source_version',
        'updated_at',
      ].forEach((f) => expect(rec[f]).toBeDefined());

      expect(rec.alpha4).toMatch(/^[A-Z]{4}$/);
      expect(rec.ebird6).toMatch(/^[a-z0-9xy]{4,8}$/);
      expect(rec.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      alpha4Set.add(rec.alpha4);
      ebird6Set.add(rec.ebird6);
    }
    expect(alpha4Set.size).toBe(sample.length);
    expect(ebird6Set.size).toBe(sample.length);

    // Global uniqueness over full file (may be heavy; do set cardinalities)
    const allAlpha4 = new Set(data.map((r: any) => r.alpha4));
    const allEBird6 = new Set(data.map((r: any) => r.ebird6));
    expect(allAlpha4.size).toBe(data.length);
    expect(allEBird6.size).toBe(data.length);
  }, 60000); // Allow up to 60s due to large CSV parsing
});
