import {
  Alpha4Code,
  EBirdCode,
  ScientificName,
  createAlpha4Code,
  createEBirdCode,
  createScientificName,
  isValidAlpha4Code,
  isValidEBirdCode,
  isValidScientificName,
} from '@domain/types';
import { csvParse } from 'd3-dsv';
import { applyGenusAdjustments } from './genus-adjustments';

// Raw record interfaces for parsed CSV data
export interface EBirdRawRecord {
  readonly category: 'species' | 'issf' | 'slash' | 'hybrid';
  readonly speciesCode: EBirdCode;
  readonly scientificName: ScientificName;
  readonly commonName: string;
}

export interface IBPRawRecord {
  readonly alpha4Code: Alpha4Code;
  readonly scientificName: ScientificName;
  readonly commonName: string;
  readonly spec6Code: string;
}

// Validation error types
export type CSVValidationErrorType =
  | 'MISSING_COLUMNS'
  | 'INVALID_SCIENTIFIC_NAME'
  | 'INVALID_ALPHA4_CODE'
  | 'INVALID_EBIRD_CODE'
  | 'EMPTY_REQUIRED_FIELD'
  | 'MALFORMED_ROW';

export interface CSVValidationError {
  readonly type: CSVValidationErrorType;
  readonly message: string;
  readonly row: number; // 1-based (excluding header) where possible
  readonly value: string;
}

export interface CSVParseStats {
  readonly totalRows: number; // data rows processed (after parsing, excludes header)
  readonly validRecords: number;
  readonly skippedRecords: number;
  readonly errorRecords: number;
}

export interface CSVParseResult<T> {
  readonly success: boolean;
  readonly records: readonly T[];
  readonly errors: readonly CSVValidationError[];
  readonly stats: CSVParseStats;
}

export interface EBirdParseOptions {
  readonly filterSpeciesOnly?: boolean;
}

export interface IBPParseOptions {
  readonly excludeSubspecies?: boolean; // skip rows where SP column is '+'
}

// Preserve full scientific name (binomial, trinomial, hybrid, slash). We'll derive binomial as needed elsewhere.
function normalizeScientificName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return applyGenusAdjustments(cleaned);
}

// Utility: remove BOM
function stripBOM(content: string): string {
  return content.replace(/^[\ufeff]+/, '');
}

/**
 * Robust eBird CSV parser using d3-dsv for RFC 4180 compliance.
 */
export function parseEBirdCSV(
  csvContent: string,
  options: EBirdParseOptions = {}
): CSVParseResult<EBirdRawRecord> {
  const { filterSpeciesOnly = false } = options;
  const cleanContent = stripBOM(csvContent);

  let rows: Array<Record<string, string>>;
  try {
    rows = csvParse(cleanContent);
  } catch (e) {
    return {
      success: false,
      records: [],
      errors: [
        {
          type: 'MALFORMED_ROW',
          message: 'Failed to parse CSV',
          row: 0,
          value: String(e),
        },
      ],
      stats: {
        totalRows: 0,
        validRecords: 0,
        skippedRecords: 0,
        errorRecords: 0,
      },
    };
  }

  if (rows.length === 0) {
    return {
      success: false,
      records: [],
      errors: [
        {
          type: 'MALFORMED_ROW',
          message: 'CSV contains no data rows',
          row: 0,
          value: '',
        },
      ],
      stats: {
        totalRows: 0,
        validRecords: 0,
        skippedRecords: 0,
        errorRecords: 0,
      },
    };
  }

  const expectedColumns = [
    'TAXON_ORDER',
    'CATEGORY',
    'SPECIES_CODE',
    'TAXON_CONCEPT_ID',
    'PRIMARY_COM_NAME',
    'SCI_NAME',
    'ORDER',
    'FAMILY',
    'SPECIES_GROUP',
    'REPORT_AS',
  ];
  const firstRow = rows[0] ?? ({} as Record<string, unknown>);
  const missingColumns = expectedColumns.filter((c) => !(c in firstRow));
  if (missingColumns.length > 0) {
    return {
      success: false,
      records: [],
      errors: [
        {
          type: 'MISSING_COLUMNS',
          message: `Required columns missing: ${missingColumns.join(', ')}`,
          row: 0,
          value: '',
        },
      ],
      stats: {
        totalRows: rows.length,
        validRecords: 0,
        skippedRecords: 0,
        errorRecords: 0,
      },
    };
  }

  const records: EBirdRawRecord[] = [];
  const errors: CSVValidationError[] = [];
  let validRecords = 0;
  let skippedRecords = 0;
  let errorRecords = 0;

  rows.forEach((r, idx) => {
    const category = String(
      r['CATEGORY'] || ''
    ).trim() as EBirdRawRecord['category'];
    const speciesCodeRaw = String(r['SPECIES_CODE'] || '').trim();
    const commonNameRaw = String(r['PRIMARY_COM_NAME'] || '').trim();
    const scientificNameRaw = String(r['SCI_NAME'] || '').trim();

    if (!speciesCodeRaw || !scientificNameRaw) {
      errorRecords++;
      errors.push({
        type: 'EMPTY_REQUIRED_FIELD',
        message: 'Missing required SPECIES_CODE or SCI_NAME',
        row: idx + 1,
        value: speciesCodeRaw || scientificNameRaw,
      });
      return;
    }

    if (filterSpeciesOnly && category !== 'species') {
      skippedRecords++;
      return;
    }

    const normalizedScientificName = normalizeScientificName(scientificNameRaw);
    if (
      !isValidScientificName(normalizedScientificName) &&
      !scientificNameRaw.includes(' x ') &&
      !scientificNameRaw.includes('/') &&
      !scientificNameRaw.includes(' sp.')
    ) {
      errorRecords++;
      errors.push({
        type: 'INVALID_SCIENTIFIC_NAME',
        message: `Invalid scientific name format: ${scientificNameRaw}`,
        row: idx + 1,
        value: scientificNameRaw,
      });
      return;
    }

    // For variant-inclusive policy C we keep hybrids and slash forms; continue skipping indeterminate ' sp.' patterns
    if (scientificNameRaw.includes(' sp.')) {
      skippedRecords++;
      return;
    }

    if (!isValidEBirdCode(speciesCodeRaw)) {
      errorRecords++;
      errors.push({
        type: 'INVALID_EBIRD_CODE',
        message: `Invalid eBird species code format: ${speciesCodeRaw}`,
        row: idx + 1,
        value: speciesCodeRaw,
      });
      return;
    }

    try {
      records.push({
        category,
        speciesCode: createEBirdCode(speciesCodeRaw),
        scientificName: createScientificName(normalizedScientificName),
        commonName: commonNameRaw,
      });
      validRecords++;
    } catch (e) {
      errorRecords++;
      errors.push({
        type: 'MALFORMED_ROW',
        message: `Failed to create record: ${String(e)}`,
        row: idx + 1,
        value: speciesCodeRaw,
      });
    }
  });

  return {
    success: errors.length === 0,
    records,
    errors,
    stats: {
      totalRows: rows.length,
      validRecords,
      skippedRecords,
      errorRecords,
    },
  };
}

/**
 * Robust IBP-AOS CSV parser using d3-dsv.
 */
export function parseIBPCSV(
  csvContent: string,
  options: IBPParseOptions = {}
): CSVParseResult<IBPRawRecord> {
  const { excludeSubspecies = false } = options;
  const cleanContent = stripBOM(csvContent);

  let rows: Array<Record<string, string>>;
  try {
    rows = csvParse(cleanContent);
  } catch (e) {
    return {
      success: false,
      records: [],
      errors: [
        {
          type: 'MALFORMED_ROW',
          message: 'Failed to parse CSV',
          row: 0,
          value: String(e),
        },
      ],
      stats: {
        totalRows: 0,
        validRecords: 0,
        skippedRecords: 0,
        errorRecords: 0,
      },
    };
  }

  if (rows.length === 0) {
    return {
      success: false,
      records: [],
      errors: [
        {
          type: 'MALFORMED_ROW',
          message: 'CSV contains no data rows',
          row: 0,
          value: '',
        },
      ],
      stats: {
        totalRows: 0,
        validRecords: 0,
        skippedRecords: 0,
        errorRecords: 0,
      },
    };
  }

  const records: IBPRawRecord[] = [];
  const errors: CSVValidationError[] = [];
  let validRecords = 0;
  let skippedRecords = 0;
  let errorRecords = 0;

  rows.forEach((r, idx) => {
    const spMarker = String(r['SP'] || '').trim();
    const alpha4CodeRaw = String(r['SPEC'] || '').trim();
    const commonNameRaw = String(r['COMMONNAME'] || '').trim();
    const scientificNameRaw = String(r['SCINAME'] || '').trim();
    const spec6CodeRaw = String(r['SPEC6'] || '').trim();

    if (!alpha4CodeRaw || !scientificNameRaw) {
      errorRecords++;
      errors.push({
        type: 'EMPTY_REQUIRED_FIELD',
        message: 'Missing required SPEC or SCINAME',
        row: idx + 1,
        value: alpha4CodeRaw || scientificNameRaw,
      });
      return;
    }

    if (excludeSubspecies && spMarker === '+') {
      skippedRecords++;
      return;
    }

    if (!isValidAlpha4Code(alpha4CodeRaw)) {
      errorRecords++;
      errors.push({
        type: 'INVALID_ALPHA4_CODE',
        message: `Invalid Alpha4Code format: ${alpha4CodeRaw}`,
        row: idx + 1,
        value: alpha4CodeRaw,
      });
      return;
    }

    const normalizedScientificName = normalizeScientificName(scientificNameRaw);
    // Skip clearly non-species group-level aggregates (family/subfamily or generic placeholders)
    const groupLevelPattern = /(gen\.?,?\s*sp\.?\)?)/i; // e.g., '(gen. sp.)', '(gen, sp)'
    if (groupLevelPattern.test(scientificNameRaw)) {
      skippedRecords++;
      return;
    }

    if (!isValidScientificName(normalizedScientificName)) {
      errorRecords++;
      errors.push({
        type: 'INVALID_SCIENTIFIC_NAME',
        message: `Invalid scientific name format: ${scientificNameRaw}`,
        row: idx + 1,
        value: scientificNameRaw,
      });
      return;
    }

    try {
      records.push({
        alpha4Code: createAlpha4Code(alpha4CodeRaw),
        scientificName: createScientificName(normalizedScientificName),
        commonName: commonNameRaw,
        spec6Code: spec6CodeRaw,
      });
      validRecords++;
    } catch (e) {
      errorRecords++;
      errors.push({
        type: 'MALFORMED_ROW',
        message: `Failed to create record: ${String(e)}`,
        row: idx + 1,
        value: alpha4CodeRaw,
      });
    }
  });

  return {
    success: errors.length === 0,
    records,
    errors,
    stats: {
      totalRows: rows.length,
      validRecords,
      skippedRecords,
      errorRecords,
    },
  };
}
