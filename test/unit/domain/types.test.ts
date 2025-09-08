import { describe, it, expect } from 'vitest';
import {
  Alpha4Code,
  EBirdCode,
  ScientificName,
  RedirectResult,
  WorkerVersion,
  MapVersion,
  createAlpha4Code,
  createEBirdCode,
  createScientificName,
  createMappingRecord,
  isValidAlpha4Code,
  isValidEBirdCode,
  isValidScientificName,
} from '@domain/types';

describe('Domain Types - TDD RED Phase', () => {
  describe('Alpha4Code branded type', () => {
    it('should create valid 4-letter uppercase codes', () => {
      expect(() => createAlpha4Code('AMCR')).not.toThrow();
      expect(() => createAlpha4Code('MALL')).not.toThrow();
    });

    it('should reject invalid formats', () => {
      expect(() => createAlpha4Code('amcr')).toThrow(
        'Invalid Alpha4Code format'
      );
      expect(() => createAlpha4Code('TOOLONG')).toThrow(
        'Invalid Alpha4Code format'
      );
      expect(() => createAlpha4Code('AM1R')).toThrow(
        'Invalid Alpha4Code format'
      );
      expect(() => createAlpha4Code('')).toThrow('Invalid Alpha4Code format');
    });

    it('should provide type-safe validation function', () => {
      expect(isValidAlpha4Code('AMCR')).toBe(true);
      expect(isValidAlpha4Code('amcr')).toBe(false);
      expect(isValidAlpha4Code('TOOLONG')).toBe(false);
    });
  });

  describe('EBirdCode branded type', () => {
    it('should create valid eBird codes with flexible format', () => {
      expect(() => createEBirdCode('amecro')).not.toThrow(); // 6 letters
      expect(() => createEBirdCode('mallad')).not.toThrow(); // 6 letters
      expect(() => createEBirdCode('emu1')).not.toThrow(); // 4 chars with number
      expect(() => createEBirdCode('ostric2')).not.toThrow(); // 7 chars with number
      expect(() => createEBirdCode('x01059')).not.toThrow(); // hybrid format
      expect(() => createEBirdCode('y00934')).not.toThrow(); // slash format
    });

    it('should reject invalid formats', () => {
      expect(() => createEBirdCode('AMECRO')).toThrow(
        'Invalid EBirdCode format'
      ); // uppercase
      expect(() => createEBirdCode('toolongname')).toThrow(
        'Invalid EBirdCode format'
      ); // too long
      expect(() => createEBirdCode('am')).toThrow('Invalid EBirdCode format'); // too short
      expect(() => createEBirdCode('')).toThrow('Invalid EBirdCode format'); // empty
      expect(() => createEBirdCode('ame-ro')).toThrow(
        'Invalid EBirdCode format'
      ); // invalid character
    });

    it('should provide type-safe validation function', () => {
      expect(isValidEBirdCode('amecro')).toBe(true);
      expect(isValidEBirdCode('emu1')).toBe(true);
      expect(isValidEBirdCode('x01059')).toBe(true);
      expect(isValidEBirdCode('AMECRO')).toBe(false);
      expect(isValidEBirdCode('toolongname')).toBe(false);
    });
  });

  describe('ScientificName branded type', () => {
    it('should create valid binomial nomenclature', () => {
      expect(() => createScientificName('Corvus americanus')).not.toThrow();
      expect(() => createScientificName('Anas platyrhynchos')).not.toThrow();
    });

    it('should accept valid trinomial and hybrid/slash variant forms', () => {
      expect(() =>
        createScientificName('Larus glaucoides kumlieni')
      ).not.toThrow();
      expect(() =>
        createScientificName(
          'Larus glaucoides thayeri / Larus glaucoides kumlieni'
        )
      ).not.toThrow();
      expect(() =>
        createScientificName('Larus glaucoides x Larus thayeri')
      ).not.toThrow();
    });

    it('should reject invalid formats', () => {
      expect(() => createScientificName('corvus americanus')).toThrow(
        'Invalid ScientificName format'
      );
      expect(() => createScientificName('Corvus')).toThrow(
        'Invalid ScientificName format'
      );
      expect(() => createScientificName('')).toThrow(
        'Invalid ScientificName format'
      );
      expect(() => createScientificName('Larus  glaucoides')).toThrow(
        'Invalid ScientificName format'
      ); // double space
      expect(() =>
        createScientificName('Larus glaucoides kumlieni extra')
      ).toThrow('Invalid ScientificName format'); // too many tokens
    });

    it('should provide type-safe validation function', () => {
      expect(isValidScientificName('Corvus americanus')).toBe(true);
      expect(isValidScientificName('corvus americanus')).toBe(false);
      expect(isValidScientificName('Corvus')).toBe(false);
      expect(isValidScientificName('Larus glaucoides kumlieni')).toBe(true);
      expect(
        isValidScientificName(
          'Larus glaucoides thayeri / Larus glaucoides kumlieni'
        )
      ).toBe(true);
      expect(isValidScientificName('Larus glaucoides x Larus thayeri')).toBe(
        true
      );
    });
  });

  describe('MappingRecord canonical schema', () => {
    it('should create valid mapping records per instructions.md spec', () => {
      const validRecord = {
        alpha4: 'AMCR' as Alpha4Code,
        ebird6: 'amecro' as EBirdCode,
        common_name: 'American Crow',
        scientific_name: 'Corvus brachyrhynchos' as ScientificName,
        source: 'XLSX IBP-AOS-LIST24',
        source_version: '2024.09',
        updated_at: '2024-09-08T00:00:00.000Z',
      };

      expect(() => createMappingRecord(validRecord)).not.toThrow();
    });

    it('should enforce all required fields per instructions.md:163-172', () => {
      const invalidRecord = {
        alpha4: 'AMCR' as Alpha4Code,
        ebird6: 'amecro' as EBirdCode,
        // Missing required fields
      };

      expect(() => createMappingRecord(invalidRecord as any)).toThrow();
    });
  });

  describe('Version types for traceability', () => {
    it('should enforce SemVer for WorkerVersion per instructions.md:195', () => {
      expect(() => ({ version: 'v1.0.0' }) as WorkerVersion).not.toThrow();
      expect(() => ({ version: 'v2.1.3' }) as WorkerVersion).not.toThrow();
    });

    it('should enforce CalVer for MapVersion per instructions.md:196', () => {
      expect(() => ({ version: '2024.09' }) as MapVersion).not.toThrow();
      expect(() => ({ version: '2024.09.08' }) as MapVersion).not.toThrow();
      expect(
        () => ({ version: '2024.09-hotfix.1' }) as MapVersion
      ).not.toThrow();
    });
  });

  describe('RedirectResult for business logic', () => {
    it('should represent successful redirect outcomes', () => {
      const successResult: RedirectResult = {
        type: 'redirect',
        destination: 'https://birdsoftheworld.org/bow/species/amecro',
        alpha4: 'AMCR' as Alpha4Code,
        ebird6: 'amecro' as EBirdCode,
      };

      expect(successResult.type).toBe('redirect');
      expect(successResult.destination).toContain('birdsoftheworld.org');
    });

    it('should represent unknown code fallback', () => {
      const unknownResult: RedirectResult = {
        type: 'unknown',
        destination: 'https://birdsoftheworld.org/',
        alpha4: 'XXXX' as Alpha4Code,
      };

      expect(unknownResult.type).toBe('unknown');
      expect(unknownResult.destination).toBe('https://birdsoftheworld.org/');
    });
  });
});
