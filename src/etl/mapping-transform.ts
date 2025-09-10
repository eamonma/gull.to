import {
  MappingRecord,
  isValidAlpha4Code,
  isValidEBirdCode,
  isValidScientificName,
} from '@domain/types';
import { JoinedRecord } from './join-logic';

// Transformation options per instructions.md requirements
export interface MappingTransformOptions {
  readonly source: string;
  readonly sourceVersion: string;
  readonly updatedAt: string;
  readonly preferredCommonNameSource?: 'ebird' | 'ibp';
}

// Validation error types for schema validation
export type MappingValidationErrorType =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FIELD_FORMAT'
  | 'INVALID_DATE_FORMAT'
  | 'DUPLICATE_ALPHA4_CODE'
  | 'INVALID_SOURCE_METADATA';

export interface MappingValidationError {
  readonly type: MappingValidationErrorType;
  readonly field: string;
  readonly message: string;
  readonly value?: unknown;
}

// Schema validation result
export interface SchemaValidationResult {
  readonly valid: boolean;
  readonly errors: readonly MappingValidationError[];
}

// Transformation statistics for observability
export interface MappingTransformStats {
  readonly totalInputRecords: number;
  readonly successfulTransformations: number;
  readonly validationErrors: number;
  readonly nameConflicts: number;
  readonly duplicateAlpha4Codes: number;
}

// Transformation metadata for provenance
export interface MappingTransformMetadata {
  readonly sourceInfo: {
    readonly source: string;
    readonly version: string;
  };
  readonly transformedAt: string;
  readonly recordCount: number;
}

// Comprehensive transformation result
export interface MappingTransformResult {
  readonly success: boolean;
  readonly mappingRecords: readonly MappingRecord[];
  readonly errors: readonly MappingValidationError[];
  readonly stats: MappingTransformStats;
  readonly metadata: MappingTransformMetadata;
}

/**
 * Validates a single mapping record against the canonical schema
 * per instructions.md:163-172
 */
export function validateMappingSchema(
  mapping: Record<string, unknown>
): SchemaValidationResult {
  const errors: MappingValidationError[] = [];

  // Required fields validation
  const requiredFields = [
    'alpha4',
    'ebird6',
    'common_name',
    'scientific_name',
    'source',
    'source_version',
    'updated_at',
  ];

  for (const field of requiredFields) {
    if (
      !(field in mapping) ||
      mapping[field] === undefined ||
      mapping[field] === '' ||
      mapping[field] === null
    ) {
      errors.push({
        type: 'MISSING_REQUIRED_FIELD',
        field,
        message: `Required field '${field}' is missing or empty`,
        value: mapping[field],
      });
    }
  }

  // Format validation for alpha4
  if (
    typeof mapping['alpha4'] === 'string' &&
    !isValidAlpha4Code(mapping['alpha4'])
  ) {
    errors.push({
      type: 'INVALID_FIELD_FORMAT',
      field: 'alpha4',
      message: `Invalid alpha4 format: ${mapping['alpha4']}. Must be exactly 4 uppercase letters A-Z.`,
      value: mapping['alpha4'],
    });
  }

  // Format validation for ebird6
  if (
    typeof mapping['ebird6'] === 'string' &&
    !isValidEBirdCode(mapping['ebird6'])
  ) {
    errors.push({
      type: 'INVALID_FIELD_FORMAT',
      field: 'ebird6',
      message: `Invalid ebird6 format: ${mapping['ebird6']}. Must be 4-8 characters: lowercase letters, numbers, x/y.`,
      value: mapping['ebird6'],
    });
  }

  // Scientific name validation
  if (
    typeof mapping['scientific_name'] === 'string' &&
    !isValidScientificName(mapping['scientific_name'])
  ) {
    errors.push({
      type: 'INVALID_FIELD_FORMAT',
      field: 'scientific_name',
      message: `Invalid scientific name format: ${mapping['scientific_name']}. Must be proper binomial nomenclature.`,
      value: mapping['scientific_name'],
    });
  }

  // ISO date validation for updated_at
  if (
    typeof mapping['updated_at'] === 'string' &&
    isNaN(Date.parse(mapping['updated_at']))
  ) {
    errors.push({
      type: 'INVALID_DATE_FORMAT',
      field: 'updated_at',
      message: `Invalid ISO date format: ${mapping['updated_at']}`,
      value: mapping['updated_at'],
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Transforms joined records to canonical mapping records per instructions.md:163-172
 * with comprehensive validation and error handling
 */
export function transformToMappingRecords(
  joinedRecords: readonly JoinedRecord[],
  options: MappingTransformOptions
): MappingTransformResult {
  // Validate transformation options
  const optionsErrors: MappingValidationError[] = [];

  if (!options.source || options.source.trim() === '') {
    optionsErrors.push({
      type: 'INVALID_SOURCE_METADATA',
      field: 'source',
      message: 'Source field is required and cannot be empty',
      value: options.source,
    });
  }

  if (!options.sourceVersion || options.sourceVersion.trim() === '') {
    optionsErrors.push({
      type: 'INVALID_SOURCE_METADATA',
      field: 'sourceVersion',
      message: 'Source version is required and cannot be empty',
      value: options.sourceVersion,
    });
  }

  if (!options.updatedAt || isNaN(Date.parse(options.updatedAt))) {
    optionsErrors.push({
      type: 'INVALID_SOURCE_METADATA',
      field: 'updatedAt',
      message: 'Updated at must be a valid ISO date string',
      value: options.updatedAt,
    });
  }

  if (optionsErrors.length > 0) {
    return {
      success: false,
      mappingRecords: [],
      errors: optionsErrors,
      stats: {
        totalInputRecords: joinedRecords.length,
        successfulTransformations: 0,
        validationErrors: optionsErrors.length,
        nameConflicts: 0,
        duplicateAlpha4Codes: 0,
      },
      metadata: {
        sourceInfo: {
          source: options.source || 'unknown',
          version: options.sourceVersion || 'unknown',
        },
        transformedAt: new Date().toISOString(),
        recordCount: 0,
      },
    };
  }

  // Handle empty input
  if (joinedRecords.length === 0) {
    return {
      success: true,
      mappingRecords: [],
      errors: [],
      stats: {
        totalInputRecords: 0,
        successfulTransformations: 0,
        validationErrors: 0,
        nameConflicts: 0,
        duplicateAlpha4Codes: 0,
      },
      metadata: {
        sourceInfo: {
          source: options.source,
          version: options.sourceVersion,
        },
        transformedAt: new Date().toISOString(),
        recordCount: 0,
      },
    };
  }

  const mappingRecords: MappingRecord[] = [];
  const errors: MappingValidationError[] = [];
  const seenAlpha4Codes = new Set<string>();

  let successfulTransformations = 0;
  let validationErrors = 0;
  let nameConflicts = 0;
  let duplicateAlpha4Codes = 0;

  for (const joinedRecord of joinedRecords) {
    try {
      // Check for null/undefined record
      if (!joinedRecord || typeof joinedRecord !== 'object') {
        errors.push({
          type: 'MISSING_REQUIRED_FIELD',
          field: 'record',
          message: 'Joined record is null, undefined, or not an object',
          value: joinedRecord,
        });
        validationErrors++;
        continue;
      }

      // Check for duplicate alpha4 codes
      const alpha4Str = String(joinedRecord.alpha4Code || '');
      if (seenAlpha4Codes.has(alpha4Str)) {
        errors.push({
          type: 'DUPLICATE_ALPHA4_CODE',
          field: 'alpha4Code',
          message: `Duplicate alpha4 code found: ${alpha4Str}`,
          value: alpha4Str,
        });
        duplicateAlpha4Codes++;
        continue;
      }
      seenAlpha4Codes.add(alpha4Str);

      // Resolve common name conflicts
      let commonName: string;
      if (joinedRecord.commonNameEBird !== joinedRecord.commonNameIBP) {
        nameConflicts++;
        // Use preferred source or default to eBird
        commonName =
          options.preferredCommonNameSource === 'ibp'
            ? joinedRecord.commonNameIBP
            : joinedRecord.commonNameEBird;
      } else {
        commonName = joinedRecord.commonNameEBird; // They're the same
      }

      // Create mapping record
      const mappingRecord: MappingRecord = {
        alpha4: joinedRecord.alpha4Code,
        ebird6: joinedRecord.ebird6Code,
        common_name: commonName,
        scientific_name: joinedRecord.scientificName,
        source: options.source,
        source_version: options.sourceVersion,
        updated_at: options.updatedAt,
      };

      // Validate the created record
      const validation = validateMappingSchema(mappingRecord);
      if (!validation.valid) {
        errors.push(...validation.errors);
        validationErrors++;
        continue;
      }

      mappingRecords.push(mappingRecord);
      successfulTransformations++;
    } catch (error) {
      errors.push({
        type: 'MISSING_REQUIRED_FIELD',
        field: 'record',
        message: `Failed to transform record: ${String(error)}`,
        value: joinedRecord,
      });
      validationErrors++;
    }
  }

  const stats: MappingTransformStats = {
    totalInputRecords: joinedRecords.length,
    successfulTransformations,
    validationErrors,
    nameConflicts,
    duplicateAlpha4Codes,
  };

  const metadata: MappingTransformMetadata = {
    sourceInfo: {
      source: options.source,
      version: options.sourceVersion,
    },
    transformedAt: new Date().toISOString(),
    recordCount: mappingRecords.length,
  };

  return {
    success: errors.length === 0,
    mappingRecords,
    errors,
    stats,
    metadata,
  };
}
