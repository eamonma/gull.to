// Brand types for compile-time safety per enterprise patterns
export type Alpha4Code = string & { readonly __brand: 'Alpha4Code' };
export type EBirdCode = string & { readonly __brand: 'EBirdCode' };
export type ScientificName = string & { readonly __brand: 'ScientificName' };

// Version types per instructions.md:195-198
export interface WorkerVersion {
  readonly version: string; // vMAJOR.MINOR.PATCH format
}

export interface MapVersion {
  readonly version: string; // YYYY.MM[.DD][-hotfix.N] format
}

// Canonical mapping record per instructions.md:163-172
export interface MappingRecord {
  readonly alpha4: Alpha4Code;
  readonly ebird6: EBirdCode;
  readonly common_name: string;
  readonly scientific_name: ScientificName;
  readonly source: string;
  readonly source_version: string;
  readonly updated_at: string; // ISO date
}

// Business logic result types
export type RedirectResult = 
  | {
      readonly type: 'redirect';
      readonly destination: string;
      readonly alpha4: Alpha4Code;
      readonly ebird6: EBirdCode;
    }
  | {
      readonly type: 'unknown';
      readonly destination: string;
      readonly alpha4: Alpha4Code;
    };

// Validation functions
export function isValidAlpha4Code(input: string): input is Alpha4Code {
  return /^[A-Z]{4}$/.test(input);
}

export function isValidEBirdCode(input: string): input is EBirdCode {
  // eBird codes: 4-8 chars, lowercase letters + numbers, can start with x/y
  return /^[a-z0-9xy]+$/.test(input) && input.length >= 4 && input.length <= 8;
}

export function isValidScientificName(input: string): input is ScientificName {
  // Binomial nomenclature: Genus species (both capitalized genus, lowercase species)
  return /^[A-Z][a-z]+ [a-z]+$/.test(input);
}

// Factory functions with validation
export function createAlpha4Code(input: string): Alpha4Code {
  if (!isValidAlpha4Code(input)) {
    throw new Error(`Invalid Alpha4Code format: ${input}. Must be exactly 4 uppercase letters A-Z.`);
  }
  return input as Alpha4Code;
}

export function createEBirdCode(input: string): EBirdCode {
  if (!isValidEBirdCode(input)) {
    throw new Error(`Invalid EBirdCode format: ${input}. Must be 4-8 characters: lowercase letters, numbers, and x/y prefixes.`);
  }
  return input as EBirdCode;
}

export function createScientificName(input: string): ScientificName {
  if (!isValidScientificName(input)) {
    throw new Error(`Invalid ScientificName format: ${input}. Must be proper binomial nomenclature (e.g., "Corvus americanus").`);
  }
  return input as ScientificName;
}

export function createMappingRecord(record: {
  readonly alpha4: Alpha4Code;
  readonly ebird6: EBirdCode;
  readonly common_name: string;
  readonly scientific_name: ScientificName;
  readonly source: string;
  readonly source_version: string;
  readonly updated_at: string;
}): MappingRecord {
  // Validate all required fields are present per instructions.md:163-172
  const requiredFields = ['alpha4', 'ebird6', 'common_name', 'scientific_name', 'source', 'source_version', 'updated_at'];
  const missing = requiredFields.filter(field => !(field in record) || record[field as keyof typeof record] === undefined || record[field as keyof typeof record] === '');
  
  if (missing.length > 0) {
    throw new Error(`Missing required MappingRecord fields: ${missing.join(', ')}`);
  }

  // Validate ISO date format for updated_at
  if (isNaN(Date.parse(record.updated_at))) {
    throw new Error(`Invalid updated_at date format: ${record.updated_at}. Must be valid ISO date string.`);
  }

  return { ...record };
}