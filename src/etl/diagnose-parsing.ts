/*
 * Diagnostic script: analyzes real CSV inputs to enumerate parsing errors
 * and join mismatches so we can understand the warnings seen in the
 * integration test (eBird parsing had 1 errors; IBP-AOS parsing had 42; join issues).
 *
 * Run with: npx tsx src/etl/diagnose-parsing.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseEBirdCSV, parseIBPCSV } from './csv-parser';
import {
  joinByScientificName,
  joinByScientificNameVariants,
} from './join-logic';

interface Grouped<T extends { type: string }> {
  [k: string]: T[];
}

function groupByType<T extends { type: string }>(
  items: readonly T[]
): Grouped<T> {
  return items.reduce<Grouped<T>>((acc, item) => {
    (acc[item.type] ||= []).push(item);
    return acc;
  }, {});
}

function logHeader(title: string) {
  console.log('\n' + '='.repeat(title.length));
  console.log(title);
  console.log('='.repeat(title.length));
}

async function main() {
  const cwd = process.cwd();
  const eBirdCsvPath = path.join(cwd, 'eBird_taxonomy_v2024.csv');
  const ibpCsvPath = path.join(cwd, 'IBP-AOS-LIST24.csv');

  if (!fs.existsSync(eBirdCsvPath) || !fs.existsSync(ibpCsvPath)) {
    console.error(
      'CSV files not found in project root. Expected eBird_taxonomy_v2024.csv and IBP-AOS-LIST24.csv'
    );
    process.exit(1);
  }

  const eBirdCsv = fs.readFileSync(eBirdCsvPath, 'utf-8');
  const ibpCsv = fs.readFileSync(ibpCsvPath, 'utf-8');

  logHeader('eBird Parse (species only)');
  const eBirdSpeciesOnly = parseEBirdCSV(eBirdCsv, { filterSpeciesOnly: true });
  const eBirdAll = parseEBirdCSV(eBirdCsv, { filterSpeciesOnly: false });

  console.log(
    `Rows (raw parsed objects): speciesOnly.valid=${eBirdSpeciesOnly.stats.validRecords}, speciesOnly.errors=${eBirdSpeciesOnly.stats.errorRecords}, speciesOnly.skipped=${eBirdSpeciesOnly.stats.skippedRecords}`
  );
  console.log(
    `Rows (all variants): all.valid=${eBirdAll.stats.validRecords}, all.errors=${eBirdAll.stats.errorRecords}, all.skipped=${eBirdAll.stats.skippedRecords}`
  );

  if (eBirdSpeciesOnly.errors.length > 0) {
    const grouped = groupByType(eBirdSpeciesOnly.errors);
    Object.entries(grouped).forEach(([type, list]) => {
      console.log(`  ErrorType ${type}: ${list.length}`);
      list
        .slice(0, 3)
        .forEach((e) =>
          console.log(
            `    sample row=${e.row} value='${e.value}' msg='${e.message}'`
          )
        );
    });
  } else {
    console.log('  No eBird species-only parse errors.');
  }

  logHeader('IBP-AOS Parse (default options)');
  const ibpParse = parseIBPCSV(ibpCsv);
  console.log(
    `Valid=${ibpParse.stats.validRecords} Errors=${ibpParse.stats.errorRecords} Skipped=${ibpParse.stats.skippedRecords}`
  );
  if (ibpParse.errors.length > 0) {
    const grouped = groupByType(ibpParse.errors);
    Object.entries(grouped).forEach(([type, list]) => {
      console.log(`  ErrorType ${type}: ${list.length}`);
      list
        .slice(0, 5)
        .forEach((e) =>
          console.log(
            `    sample row=${e.row} value='${e.value}' msg='${e.message}'`
          )
        );
    });
  }

  logHeader('Join (simple scientificName)');
  const joinSimple = joinByScientificName(
    eBirdSpeciesOnly.records,
    ibpParse.records,
    { strictMode: false }
  );
  console.log(
    `Matched=${joinSimple.stats.successfulMatches} UnmatchedEBird=${joinSimple.stats.unmatchedEBirdRecords} UnmatchedIBP=${joinSimple.stats.unmatchedIBPRecords}`
  );

  logHeader('Join (variant-aware)');
  const joinVariants = joinByScientificNameVariants(
    eBirdAll.records,
    ibpParse.records,
    { strictMode: false, variantPolicy: 'all' }
  );
  console.log(
    `Matched=${joinVariants.stats.successfulMatches} UnmatchedEBird=${joinVariants.stats.unmatchedEBirdRecords} UnmatchedIBP=${joinVariants.stats.unmatchedIBPRecords}`
  );

  // Show delta improvement
  const improvement =
    joinVariants.stats.successfulMatches - joinSimple.stats.successfulMatches;
  if (improvement > 0) {
    console.log(
      `Variant-aware join added +${improvement} matches (+${((improvement / joinSimple.stats.successfulMatches) * 100).toFixed(2)}% over simple).`
    );
  }

  // Provide hints for the common error drivers
  console.log('\nHints:');
  console.log(
    '- INVALID_ALPHA4_CODE usually means non 4-letter uppercase code or empty SPEC column.'
  );
  console.log(
    '- INVALID_SCIENTIFIC_NAME means the value did not match accepted regex (binomial / trinomial / simple hybrid / slash).'
  );
  console.log(
    '- Consider relaxing regex or normalizing edge cases (e.g., removing authors, symbols) upstream.'
  );
}

main().catch((e) => {
  console.error('Diagnostic failed', e);
  process.exit(1);
});
