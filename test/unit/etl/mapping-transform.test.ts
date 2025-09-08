import { describe, it, expect } from 'vitest';
import {
  transformToMappingRecords,
  validateMappingSchema,
  MappingTransformResult,
  MappingValidationError,
} from '@etl/mapping-transform';
import { JoinedRecord } from '@etl/join-logic';
import { 
  createAlpha4Code, 
  createEBirdCode, 
  createScientificName,
  MappingRecord 
} from '@domain/types';

describe('Mapping Data Transformation - TDD RED Phase', () => {
  const mockJoinedRecords: JoinedRecord[] = [
    {
      alpha4Code: createAlpha4Code('AMCR'),
      ebird6Code: createEBirdCode('amecro'),
      scientificName: createScientificName('Corvus brachyrhynchos'),
      commonNameEBird: 'American Crow',
      commonNameIBP: 'American Crow',
    },
    {
      alpha4Code: createAlpha4Code('MALL'),
      ebird6Code: createEBirdCode('mallad'),
      scientificName: createScientificName('Anas platyrhynchos'),
      commonNameEBird: 'Mallard',
      commonNameIBP: 'Mallard',
    },
  ];

  const mockTransformOptions = {
    source: 'XLSX IBP-AOS-LIST24',
    sourceVersion: '2024.09',
    updatedAt: '2024-09-08T00:00:00.000Z',
  };

  describe('Successful transformation per instructions.md:163-172', () => {
    it('should transform joined records to canonical mapping format', () => {
      const result = transformToMappingRecords(mockJoinedRecords, mockTransformOptions);

      expect(result.success).toBe(true);
      expect(result.mappingRecords).toHaveLength(2);

      const firstRecord = result.mappingRecords[0]!;
      expect(firstRecord.alpha4).toBe('AMCR');
      expect(firstRecord.ebird6).toBe('amecro');
      expect(firstRecord.common_name).toBe('American Crow');
      expect(firstRecord.scientific_name).toBe('Corvus brachyrhynchos');
      expect(firstRecord.source).toBe('XLSX IBP-AOS-LIST24');
      expect(firstRecord.source_version).toBe('2024.09');
      expect(firstRecord.updated_at).toBe('2024-09-08T00:00:00.000Z');
    });

    it('should handle common name resolution conflicts', () => {
      const conflictingRecords: JoinedRecord[] = [{
        alpha4Code: createAlpha4Code('AMCR'),
        ebird6Code: createEBirdCode('amecro'),
        scientificName: createScientificName('Corvus brachyrhynchos'),
        commonNameEBird: 'American Crow',
        commonNameIBP: 'Common Crow', // Different name
      }];

      const result = transformToMappingRecords(conflictingRecords, {
        ...mockTransformOptions,
        preferredCommonNameSource: 'ebird', // Prefer eBird naming
      });

      expect(result.success).toBe(true);
      expect(result.mappingRecords[0]?.common_name).toBe('American Crow'); // eBird name used
    });

    it('should provide comprehensive transformation statistics', () => {
      const result = transformToMappingRecords(mockJoinedRecords, mockTransformOptions);

      expect(result.stats.totalInputRecords).toBe(2);
      expect(result.stats.successfulTransformations).toBe(2);
      expect(result.stats.validationErrors).toBe(0);
      expect(result.stats.nameConflicts).toBe(0);
    });
  });

  describe('Schema validation per instructions.md requirements', () => {
    it('should validate all required fields are present', () => {
      const validMapping: MappingRecord = {
        alpha4: createAlpha4Code('AMCR'),
        ebird6: createEBirdCode('amecro'),
        common_name: 'American Crow',
        scientific_name: createScientificName('Corvus brachyrhynchos'),
        source: 'XLSX IBP-AOS-LIST24',
        source_version: '2024.09',
        updated_at: '2024-09-08T00:00:00.000Z',
      };

      const result = validateMappingSchema(validMapping);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject records with missing required fields', () => {
      const invalidMapping = {
        alpha4: createAlpha4Code('AMCR'),
        ebird6: createEBirdCode('amecro'),
        // Missing required fields
      } as any;

      const result = validateMappingSchema(invalidMapping);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'common_name')).toBe(true);
      expect(result.errors.some(e => e.field === 'scientific_name')).toBe(true);
    });

    it('should validate ISO date format for updated_at field', () => {
      const invalidDateMapping: MappingRecord = {
        alpha4: createAlpha4Code('AMCR'),
        ebird6: createEBirdCode('amecro'),
        common_name: 'American Crow',
        scientific_name: createScientificName('Corvus brachyrhynchos'),
        source: 'XLSX IBP-AOS-LIST24',
        source_version: '2024.09',
        updated_at: 'invalid-date-format',
      };

      const result = validateMappingSchema(invalidDateMapping);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'updated_at')).toBe(true);
    });

    it('should validate alpha4 and ebird6 format constraints', () => {
      const invalidFormatMapping: MappingRecord = {
        alpha4: 'invalid' as any, // Wrong format
        ebird6: 'INVALID' as any,  // Wrong format  
        common_name: 'American Crow',
        scientific_name: createScientificName('Corvus brachyrhynchos'),
        source: 'XLSX IBP-AOS-LIST24',
        source_version: '2024.09',
        updated_at: '2024-09-08T00:00:00.000Z',
      };

      const result = validateMappingSchema(invalidFormatMapping);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'alpha4')).toBe(true);
      expect(result.errors.some(e => e.field === 'ebird6')).toBe(true);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = transformToMappingRecords([], mockTransformOptions);

      expect(result.success).toBe(true);
      expect(result.mappingRecords).toHaveLength(0);
      expect(result.stats.totalInputRecords).toBe(0);
    });

    it('should handle transformation failures without crashing', () => {
      const malformedRecords = [{
        // Intentionally malformed record
        alpha4Code: null,
        ebird6Code: undefined,
        scientificName: '',
      }] as any;

      const result = transformToMappingRecords(malformedRecords, mockTransformOptions);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.stats.validationErrors).toBeGreaterThan(0);
    });

    it('should validate source metadata format', () => {
      const invalidOptionsResult = transformToMappingRecords(mockJoinedRecords, {
        source: '', // Empty source
        sourceVersion: 'invalid version',
        updatedAt: 'not-an-iso-date',
      });

      expect(invalidOptionsResult.success).toBe(false);
      expect(invalidOptionsResult.errors.some(e => e.type === 'INVALID_SOURCE_METADATA')).toBe(true);
    });
  });

  describe('Data integrity and uniqueness validation', () => {
    it('should detect and handle duplicate alpha4 codes', () => {
      const duplicateRecords: JoinedRecord[] = [
        mockJoinedRecords[0]!,
        mockJoinedRecords[0]!, // Duplicate
      ];

      const result = transformToMappingRecords(duplicateRecords, mockTransformOptions);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.type === 'DUPLICATE_ALPHA4_CODE')).toBe(true);
      expect(result.stats.duplicateAlpha4Codes).toBe(1);
    });

    it('should validate unique constraint per instructions.md:173-177', () => {
      const result = transformToMappingRecords(mockJoinedRecords, mockTransformOptions);

      // Extract all alpha4 codes
      const alpha4Codes = result.mappingRecords.map(r => r.alpha4);
      const uniqueAlpha4s = new Set(alpha4Codes);

      expect(alpha4Codes.length).toBe(uniqueAlpha4s.size); // No duplicates
    });

    it('should validate BOW destination template safety', () => {
      const result = transformToMappingRecords(mockJoinedRecords, mockTransformOptions);

      // All ebird6 codes should be safe for URL template substitution
      for (const record of result.mappingRecords) {
        const bowUrl = `https://birdsoftheworld.org/bow/species/${record.ebird6}`;
        expect(bowUrl).toMatch(/^https:\/\/birdsoftheworld\.org\/bow\/species\/[a-z0-9xy]+$/);
      }
    });
  });

  describe('Versioning and metadata per instructions.md:195-198', () => {
    it('should support CalVer format for map versioning', () => {
      const calverOptions = {
        source: 'XLSX IBP-AOS-LIST24',
        sourceVersion: '2024.09.08-hotfix.1',
        updatedAt: '2024-09-08T12:00:00.000Z',
      };

      const result = transformToMappingRecords(mockJoinedRecords, calverOptions);

      expect(result.success).toBe(true);
      expect(result.mappingRecords[0]?.source_version).toBe('2024.09.08-hotfix.1');
    });

    it('should include provenance information for debugging', () => {
      const result = transformToMappingRecords(mockJoinedRecords, mockTransformOptions);

      expect(result.metadata.sourceInfo.source).toBe('XLSX IBP-AOS-LIST24');
      expect(result.metadata.sourceInfo.version).toBe('2024.09');
      expect(result.metadata.transformedAt).toBeDefined();
      expect(result.metadata.recordCount).toBe(2);
    });
  });
});