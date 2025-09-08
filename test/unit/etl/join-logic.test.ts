import { describe, it, expect } from 'vitest';
import {
  joinByScientificName,
  JoinedRecord,
  JoinResult,
  JoinStatistics,
  JoinOptions,
} from '@etl/join-logic';
import { EBirdRawRecord, IBPRawRecord } from '@etl/csv-parser';
import {
  createAlpha4Code,
  createEBirdCode,
  createScientificName,
} from '@domain/types';

describe('Scientific Name Join Logic - TDD RED Phase', () => {
  const mockEBirdRecords: EBirdRawRecord[] = [
    {
      category: 'species',
      speciesCode: createEBirdCode('amecro'),
      scientificName: createScientificName('Corvus brachyrhynchos'),
      commonName: 'American Crow',
    },
    {
      category: 'species',
      speciesCode: createEBirdCode('mallad'),
      scientificName: createScientificName('Anas platyrhynchos'),
      commonName: 'Mallard',
    },
    {
      category: 'species',
      speciesCode: createEBirdCode('norcrd'),
      scientificName: createScientificName('Cardinalis cardinalis'),
      commonName: 'Northern Cardinal',
    },
  ];

  const mockIBPRecords: IBPRawRecord[] = [
    {
      alpha4Code: createAlpha4Code('AMCR'),
      scientificName: createScientificName('Corvus brachyrhynchos'),
      commonName: 'American Crow',
      spec6Code: 'CORAME', // Different from eBird format
    },
    {
      alpha4Code: createAlpha4Code('MALL'),
      scientificName: createScientificName('Anas platyrhynchos'),
      commonName: 'Mallard',
      spec6Code: 'ANAPLA',
    },
    {
      alpha4Code: createAlpha4Code('UNKN'),
      scientificName: createScientificName('Species unknown'),
      commonName: 'Unknown Bird',
      spec6Code: 'UNKUNK',
    },
  ];

  describe('Successful joins', () => {
    it('should join records by exact scientific name match', () => {
      const result = joinByScientificName(mockEBirdRecords, mockIBPRecords);

      expect(result.success).toBe(true);
      expect(result.matched).toHaveLength(2);

      const firstMatch = result.matched[0]!;
      expect(firstMatch.alpha4Code).toBe('AMCR');
      expect(firstMatch.ebird6Code).toBe('amecro');
      expect(firstMatch.scientificName).toBe(
        createScientificName('Corvus brachyrhynchos')
      );
      expect(firstMatch.commonNameEBird).toBe('American Crow');
      expect(firstMatch.commonNameIBP).toBe('American Crow');
    });

    it('should provide comprehensive join statistics', () => {
      const result = joinByScientificName(mockEBirdRecords, mockIBPRecords);

      expect(result.stats.totalEBirdRecords).toBe(3);
      expect(result.stats.totalIBPRecords).toBe(3);
      expect(result.stats.successfulMatches).toBe(2);
      expect(result.stats.unmatchedEBirdRecords).toBe(1);
      expect(result.stats.unmatchedIBPRecords).toBe(1);
      expect(result.stats.duplicateScientificNames).toBe(0);
    });

    it('should track unmatched records for analysis', () => {
      const result = joinByScientificName(mockEBirdRecords, mockIBPRecords);

      expect(result.unmatchedEBird).toHaveLength(1);
      expect(result.unmatchedEBird[0]?.scientificName).toBe(
        createScientificName('Cardinalis cardinalis')
      );

      expect(result.unmatchedIBP).toHaveLength(1);
      expect(result.unmatchedIBP[0]?.scientificName).toBe(
        createScientificName('Species unknown')
      );
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle empty input datasets', () => {
      const result = joinByScientificName([], []);

      expect(result.success).toBe(true);
      expect(result.matched).toHaveLength(0);
      expect(result.stats.totalEBirdRecords).toBe(0);
      expect(result.stats.totalIBPRecords).toBe(0);
    });

    it('should detect duplicate scientific names within datasets', () => {
      const duplicateEBird = [
        ...mockEBirdRecords,
        {
          category: 'species' as const,
          speciesCode: createEBirdCode('amecro'), // Same code, same scientific name (duplicate)
          scientificName: createScientificName('Corvus brachyrhynchos'),
          commonName: 'American Crow (variant)',
        },
      ];

      const result = joinByScientificName(duplicateEBird, mockIBPRecords);

      expect(result.success).toBe(false);
      expect(result.duplicateScientificNames).toContain(
        'Corvus brachyrhynchos'
      );
      expect(result.stats.duplicateScientificNames).toBe(1);
    });

    it('should handle non-matching scientific names', () => {
      const caseMismatchIBP = [
        {
          alpha4Code: createAlpha4Code('AMCR'),
          scientificName: createScientificName('Corvus americanus'), // Different species to test no match
          commonName: 'American Crow',
          spec6Code: 'CORAME',
        },
      ];

      const result = joinByScientificName(mockEBirdRecords, caseMismatchIBP);

      expect(result.matched).toHaveLength(0); // No matches due to different species
      expect(result.unmatchedEBird).toHaveLength(3);
      expect(result.unmatchedIBP).toHaveLength(1);
    });
  });

  describe('Join options and filtering', () => {
    it('should support strict mode with comprehensive validation', () => {
      const options: JoinOptions = {
        strictMode: true,
        allowPartialMatches: false,
        validateCommonNames: true,
      };

      const result = joinByScientificName(
        mockEBirdRecords,
        mockIBPRecords,
        options
      );

      expect(result.success).toBe(true);
      expect(
        result.matched.every((r) => r.commonNameEBird === r.commonNameIBP)
      ).toBe(true);
    });

    it('should support relaxed mode for name variations', () => {
      const nameVariationIBP = [
        {
          alpha4Code: createAlpha4Code('AMCR'),
          scientificName: createScientificName('Corvus brachyrhynchos'),
          commonName: 'Common Crow', // Different common name
          spec6Code: 'CORAME',
        },
      ];

      const options: JoinOptions = {
        strictMode: false,
        allowPartialMatches: true,
        validateCommonNames: false,
      };

      const result = joinByScientificName(
        mockEBirdRecords,
        nameVariationIBP,
        options
      );

      expect(result.success).toBe(true);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]?.commonNameEBird).not.toBe(
        result.matched[0]?.commonNameIBP
      );
    });
  });

  describe('JoinedRecord contract validation', () => {
    it('should create properly structured joined records per domain requirements', () => {
      const result = joinByScientificName(mockEBirdRecords, mockIBPRecords);

      const record = result.matched[0]!;

      // Verify all required fields are present and properly typed
      expect(typeof record.alpha4Code).toBe('string');
      expect(typeof record.ebird6Code).toBe('string');
      expect(typeof record.scientificName).toBe('string');
      expect(typeof record.commonNameEBird).toBe('string');
      expect(typeof record.commonNameIBP).toBe('string');

      // Verify branded type constraints
      expect(record.alpha4Code).toMatch(/^[A-Z]{4}$/);
      expect(record.ebird6Code).toMatch(/^[a-z]{6}$/);
      expect(record.scientificName).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
    });
  });

  describe('Performance and scalability considerations', () => {
    it('should handle datasets with proper performance characteristics', () => {
      // Use existing mock data to test performance without duplicates
      const startTime = performance.now();
      const result = joinByScientificName(mockEBirdRecords, mockIBPRecords);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(result.matched.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(50); // Should complete very quickly with small dataset
    });
  });
});
