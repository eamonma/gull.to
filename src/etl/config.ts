// Centralized ETL configuration for raw data asset locations & patterns.
// This allows tests and the build runner to rely on consistent canonical paths.

export const RAW_DATA_DIR = 'data/raw';

export const EBIRD_DIR = `${RAW_DATA_DIR}/ebird`;
export const IBP_AOS_DIR = `${RAW_DATA_DIR}/ibp-aos`;

// Default current release year (adjust as new taxonomy versions arrive)
export const DEFAULT_DATA_YEAR = 2024;

// Canonical filenames
export function ebirdCsvFile(year: number = DEFAULT_DATA_YEAR): string {
  return `${EBIRD_DIR}/ebird-taxonomy-${year}.csv`;
}

export function ibpAosCsvFile(year: number = DEFAULT_DATA_YEAR): string {
  return `${IBP_AOS_DIR}/ibp-aos-list-${year}.csv`;
}

// Default resolved full paths
export const DEFAULT_EBIRD_CSV = ebirdCsvFile();
export const DEFAULT_IBP_AOS_CSV = ibpAosCsvFile();

// CalVer pattern used for mapping output (YYYY.MM[.DD][-hotfix.N])
export const CALVER_PATTERN = /^(\d{4})\.\d{2}(?:\.\d{2})?(?:-hotfix\.\d+)?$/;
