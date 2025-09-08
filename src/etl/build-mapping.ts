import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseEBirdCSV, parseIBPCSV } from './csv-parser';
import { joinByScientificNameVariants } from './join-logic';
import { transformToMappingRecords } from './mapping-transform';
import {
  DEFAULT_EBIRD_CSV,
  DEFAULT_IBP_AOS_CSV,
  CALVER_PATTERN,
} from './config';

export interface RunBuildMappingOptions {
  ebirdCsvPath?: string;
  ibpAosCsvPath?: string;
  outputDir?: string; // if omitted, will default to data/mapping
  mapVersion: string; // CalVer
  updatedAt: string; // ISO timestamp
  preferredCommonNameSource?: 'ebird' | 'ibp';
}

export interface RunBuildMappingResult {
  outputPath: string;
  recordCount: number;
  mapVersion: string;
}

// NOTE: This is an initial minimal implementation to satisfy tests; may be refined.
export async function runBuildMapping(
  options: RunBuildMappingOptions
): Promise<RunBuildMappingResult> {
  const ebirdCsvPath = options.ebirdCsvPath || DEFAULT_EBIRD_CSV;
  const ibpAosCsvPath = options.ibpAosCsvPath || DEFAULT_IBP_AOS_CSV;
  const outDir = options.outputDir || 'data/mapping';

  if (!CALVER_PATTERN.test(options.mapVersion)) {
    throw new Error(`Invalid mapVersion CalVer format: ${options.mapVersion}`);
  }
  if (!fs.existsSync(ebirdCsvPath)) {
    throw new Error(`eBird CSV not found at ${ebirdCsvPath}`);
  }
  if (!fs.existsSync(ibpAosCsvPath)) {
    throw new Error(`IBP-AOS CSV not found at ${ibpAosCsvPath}`);
  }

  const ebirdRaw = fs.readFileSync(ebirdCsvPath, 'utf-8');
  const ibpRaw = fs.readFileSync(ibpAosCsvPath, 'utf-8');

  // Variant policy C: include species, subspecies, hybrids
  const ebirdParsed = parseEBirdCSV(ebirdRaw, { filterSpeciesOnly: false });
  const ibpParsed = parseIBPCSV(ibpRaw);

  const joinResult = joinByScientificNameVariants(
    ebirdParsed.records || [],
    ibpParsed.records || [],
    { strictMode: false, variantPolicy: 'all' }
  );

  const transform = transformToMappingRecords(joinResult.matched || [], {
    source: 'etl-build',
    sourceVersion: options.mapVersion,
    updatedAt: options.updatedAt,
    preferredCommonNameSource: options.preferredCommonNameSource || 'ebird',
  });

  if (!transform.success) {
    // For now, still emit partial results but note this might be changed to hard fail.
    if (transform.mappingRecords.length === 0) {
      throw new Error('Transformation failed with no mapping records');
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `map-${options.mapVersion}.json`);
  fs.writeFileSync(
    outputPath,
    JSON.stringify(transform.mappingRecords, null, 2)
  );

  return {
    outputPath,
    recordCount: transform.mappingRecords.length,
    mapVersion: options.mapVersion,
  };
}
// CLI support when executed directly with tsx / node
const isMainModule =
  process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const mapVersion = process.env['MAP_VERSION'] || '2024.09';
  const updatedAt = new Date().toISOString();
  runBuildMapping({ mapVersion, updatedAt })
    .then((r) => {
      console.log(
        `✅ Generated mapping file: ${r.outputPath} (${r.recordCount} records)`
      );
    })
    .catch((err) => {
      console.error('❌ ETL build failed:', err);
      process.exit(1);
    });
}
