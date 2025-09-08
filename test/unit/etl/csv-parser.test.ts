import { describe, it, expect } from 'vitest';
import {
  parseEBirdCSV,
  parseIBPCSV,
  EBirdRawRecord,
  CSVParseResult,
  CSVValidationError,
} from '@etl/csv-parser';
import { createScientificName } from '@domain/types';

describe('CSV Parser - TDD RED Phase', () => {
  describe('eBird CSV parsing with BOM handling', () => {
    const validEBirdCSV = `\ufeffTAXON_ORDER,CATEGORY,SPECIES_CODE,TAXON_CONCEPT_ID,PRIMARY_COM_NAME,SCI_NAME,ORDER,FAMILY,SPECIES_GROUP,REPORT_AS
2,species,amecro,,American Crow,Corvus brachyrhynchos,Passeriformes,Corvidae (Crows and Jays),Corvids,
3,species,mallad,,Mallard,Anas platyrhynchos,Anseriformes,"Anatidae (Ducks, Geese, and Waterfowl)",Waterfowl,
4,hybrid,croxfi,,American Crow x Fish Crow (hybrid),Corvus brachyrhynchos x ossifragus,Passeriformes,Corvidae (Crows and Jays),Corvids,`;

    it('should parse valid eBird CSV with BOM including hybrid (variant policy C)', () => {
      const result = parseEBirdCSV(validEBirdCSV);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(3); // hybrid now included

      const hybrid = result.records.find((r) => r.category === 'hybrid');
      // eBird row uses full form "Corvus brachyrhynchos x ossifragus" (second genus omitted is allowed); validator accepts shorthand
      expect(hybrid?.scientificName).toBe(
        createScientificName('Corvus brachyrhynchos x ossifragus')
      );
    });

    it('should filter to species category only by default', () => {
      const result = parseEBirdCSV(validEBirdCSV, { filterSpeciesOnly: true });

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(2); // only species, hybrid already skipped due to scientific name
      expect(result.records.every((r: any) => r.category === 'species')).toBe(
        true
      );
    });

    it('should handle malformed CSV with validation errors', () => {
      const malformedCSV = `TAXON_ORDER,CATEGORY,SPECIES_CODE
invalid,data,row`;

      const result = parseEBirdCSV(malformedCSV);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('MISSING_COLUMNS');
    });

    it('should validate scientific name format during parsing', () => {
      const invalidScientificNameCSV = `\ufeffTAXON_ORDER,CATEGORY,SPECIES_CODE,TAXON_CONCEPT_ID,PRIMARY_COM_NAME,SCI_NAME,ORDER,FAMILY,SPECIES_GROUP,REPORT_AS
2,species,amecro,,American Crow,corvus brachyrhynchos,Passeriformes,Corvidae,Corvids,`; // lowercase genus

      const result = parseEBirdCSV(invalidScientificNameCSV);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('INVALID_SCIENTIFIC_NAME');
    });
  });

  describe('IBP-AOS CSV parsing', () => {
    const validIBPCSV = `SP,B4,SPEC,CONF,B1,COMMONNAME,B2,SCINAME,SPEC6,CONF6
,,AMCR,,,American Crow,,Corvus brachyrhynchos,CORAME,
,,MALL,,,Mallard,,Anas platyrhynchos,ANAPLA,
+,,LSGW,,,Lesser Snow Goose White-morph,,Anser caerulescens caerulescens,ANSCCA,`; // subspecies marked with +

    it('should parse valid IBP CSV', () => {
      const result = parseIBPCSV(validIBPCSV);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(3);

      const firstRecord = result.records[0]!;
      expect(firstRecord.alpha4Code).toBe('AMCR');
      expect(firstRecord.scientificName).toBe(
        createScientificName('Corvus brachyrhynchos')
      );
      expect(firstRecord.commonName).toBe('American Crow');
      expect(firstRecord.spec6Code).toBe('CORAME');
    });

    it('should exclude subspecies/morphs by default', () => {
      const result = parseIBPCSV(validIBPCSV, { excludeSubspecies: true });

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(2); // excludes the + marked record
      expect(
        result.records.every((r: any) => !r.alpha4Code.startsWith('+'))
      ).toBe(true);
    });

    it('should preserve trinomial scientific names for subspecies (variant policy C)', () => {
      const result = parseIBPCSV(validIBPCSV);
      const subspeciesRecord = result.records.find(
        (r: any) => r.alpha4Code === 'LSGW'
      );
      expect(subspeciesRecord?.scientificName).toBe(
        createScientificName('Anser caerulescens caerulescens')
      );
    });

    it('should validate alpha4 code format during parsing', () => {
      const invalidAlpha4CSV = `SP,B4,SPEC,CONF,B1,COMMONNAME,B2,SCINAME,SPEC6,CONF6
,,AM1R,,,Invalid Code,,Corvus brachyrhynchos,CORAME,`; // contains number

      const result = parseIBPCSV(invalidAlpha4CSV);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('INVALID_ALPHA4_CODE');
    });
  });

  describe('CSV Parser result contracts', () => {
    it('should provide comprehensive error information', () => {
      const error: CSVValidationError = {
        type: 'MISSING_COLUMNS',
        message: 'Required columns missing: SCI_NAME',
        row: 1,
        value: 'invalid,data',
      };

      expect(error.type).toBe('MISSING_COLUMNS');
      expect(error.message).toContain('SCI_NAME');
      expect(error.row).toBe(1);
    });

    it('should provide parsing statistics', () => {
      const result: CSVParseResult<EBirdRawRecord> = {
        success: true,
        records: [],
        errors: [],
        stats: {
          totalRows: 100,
          validRecords: 95,
          skippedRecords: 3,
          errorRecords: 2,
        },
      };

      expect(result.stats.totalRows).toBe(100);
      expect(
        result.stats.validRecords +
          result.stats.skippedRecords +
          result.stats.errorRecords
      ).toBe(100);
    });
  });
});
