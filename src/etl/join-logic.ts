import { Alpha4Code, EBirdCode, ScientificName } from '@domain/types';
import { EBirdRawRecord, IBPRawRecord } from './csv-parser';

// Joined record combining both data sources
export interface JoinedRecord {
  readonly alpha4Code: Alpha4Code;
  readonly ebird6Code: EBirdCode;
  readonly scientificName: ScientificName;
  readonly commonNameEBird: string;
  readonly commonNameIBP: string;
}

// Comprehensive join statistics for observability
export interface JoinStatistics {
  readonly totalEBirdRecords: number;
  readonly totalIBPRecords: number;
  readonly successfulMatches: number;
  readonly unmatchedEBirdRecords: number;
  readonly unmatchedIBPRecords: number;
  readonly duplicateScientificNames: number;
}

// Join result with comprehensive error tracking
export interface JoinResult {
  readonly success: boolean;
  readonly matched: readonly JoinedRecord[];
  readonly unmatchedEBird: readonly EBirdRawRecord[];
  readonly unmatchedIBP: readonly IBPRawRecord[];
  readonly duplicateScientificNames: readonly string[];
  readonly stats: JoinStatistics;
}

// Join options for different validation strategies
export interface JoinOptions {
  readonly strictMode?: boolean;
  readonly allowPartialMatches?: boolean;
  readonly validateCommonNames?: boolean;
}

// Default join options
const defaultJoinOptions: Required<JoinOptions> = {
  strictMode: false,
  allowPartialMatches: true,
  validateCommonNames: false,
};

/**
 * Joins eBird and IBP records by scientific name with comprehensive validation
 * 
 * @param ebirdRecords - Parsed eBird taxonomy records
 * @param ibpRecords - Parsed IBP-AOS alpha code records  
 * @param options - Join configuration options
 * @returns Comprehensive join result with statistics and unmatched records
 */
export function joinByScientificName(
  ebirdRecords: readonly EBirdRawRecord[],
  ibpRecords: readonly IBPRawRecord[],
  options: JoinOptions = {}
): JoinResult {
  const opts = { ...defaultJoinOptions, ...options };
  
  // Handle empty datasets
  if (ebirdRecords.length === 0 && ibpRecords.length === 0) {
    return {
      success: true,
      matched: [],
      unmatchedEBird: [],
      unmatchedIBP: [],
      duplicateScientificNames: [],
      stats: {
        totalEBirdRecords: 0,
        totalIBPRecords: 0,
        successfulMatches: 0,
        unmatchedEBirdRecords: 0,
        unmatchedIBPRecords: 0,
        duplicateScientificNames: 0,
      },
    };
  }

  // Check for duplicate scientific names within each dataset
  const duplicates = new Set<string>();
  
  // Check eBird duplicates
  const ebirdScientificNames = new Set<string>();
  for (const record of ebirdRecords) {
    if (ebirdScientificNames.has(record.scientificName)) {
      duplicates.add(record.scientificName);
    }
    ebirdScientificNames.add(record.scientificName);
  }
  
  // Check IBP duplicates  
  const ibpScientificNames = new Set<string>();
  for (const record of ibpRecords) {
    if (ibpScientificNames.has(record.scientificName)) {
      duplicates.add(record.scientificName);
    }
    ibpScientificNames.add(record.scientificName);
  }

  // If strict mode and duplicates found, fail immediately
  if (opts.strictMode && duplicates.size > 0) {
    return {
      success: false,
      matched: [],
      unmatchedEBird: [...ebirdRecords],
      unmatchedIBP: [...ibpRecords],
      duplicateScientificNames: [...duplicates],
      stats: {
        totalEBirdRecords: ebirdRecords.length,
        totalIBPRecords: ibpRecords.length,
        successfulMatches: 0,
        unmatchedEBirdRecords: ebirdRecords.length,
        unmatchedIBPRecords: ibpRecords.length,
        duplicateScientificNames: duplicates.size,
      },
    };
  }

  // Create lookup maps for efficient joining
  const ebirdByScientificName = new Map<string, EBirdRawRecord>();
  const ibpByScientificName = new Map<string, IBPRawRecord>();

  // Populate eBird lookup (last wins for duplicates)
  for (const record of ebirdRecords) {
    ebirdByScientificName.set(record.scientificName, record);
  }

  // Populate IBP lookup (last wins for duplicates)  
  for (const record of ibpRecords) {
    ibpByScientificName.set(record.scientificName, record);
  }

  // Perform the join
  const matched: JoinedRecord[] = [];
  const unmatchedEBird: EBirdRawRecord[] = [];
  const unmatchedIBP: IBPRawRecord[] = [];

  // Process all unique scientific names from both datasets
  const allScientificNames = new Set([
    ...ebirdByScientificName.keys(),
    ...ibpByScientificName.keys(),
  ]);

  for (const scientificName of allScientificNames) {
    const ebirdRecord = ebirdByScientificName.get(scientificName);
    const ibpRecord = ibpByScientificName.get(scientificName);

    if (ebirdRecord && ibpRecord) {
      // Successful match - validate common names if required
      if (opts.validateCommonNames && ebirdRecord.commonName !== ibpRecord.commonName) {
        // In strict mode, this would be an error; in relaxed mode, we allow it
        if (opts.strictMode) {
          unmatchedEBird.push(ebirdRecord);
          unmatchedIBP.push(ibpRecord);
          continue;
        }
      }

      const joinedRecord: JoinedRecord = {
        alpha4Code: ibpRecord.alpha4Code,
        ebird6Code: ebirdRecord.speciesCode,
        scientificName: ebirdRecord.scientificName, // Use eBird as canonical
        commonNameEBird: ebirdRecord.commonName,
        commonNameIBP: ibpRecord.commonName,
      };

      matched.push(joinedRecord);
    } else if (ebirdRecord && !ibpRecord) {
      unmatchedEBird.push(ebirdRecord);
    } else if (!ebirdRecord && ibpRecord) {
      unmatchedIBP.push(ibpRecord);
    }
  }

  const stats: JoinStatistics = {
    totalEBirdRecords: ebirdRecords.length,
    totalIBPRecords: ibpRecords.length,
    successfulMatches: matched.length,
    unmatchedEBirdRecords: unmatchedEBird.length,
    unmatchedIBPRecords: unmatchedIBP.length,
    duplicateScientificNames: duplicates.size,
  };

  return {
    success: duplicates.size === 0, // Success if no duplicates found
    matched,
    unmatchedEBird,
    unmatchedIBP,
    duplicateScientificNames: [...duplicates],
    stats,
  };
}