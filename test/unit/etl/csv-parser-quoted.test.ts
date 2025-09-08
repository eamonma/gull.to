import { describe, it, expect } from 'vitest';
import { parseEBirdCSV, parseIBPCSV } from '@etl/csv-parser';

// TDD: ensure our switch to d3-dsv (robust parser) correctly handles quoted commas & quotes.

describe('CSV Parser Robust Quoted Field Handling', () => {
  it('should correctly parse eBird CSV lines with quoted commas', () => {
    const csv = [
      'TAXON_ORDER,CATEGORY,SPECIES_CODE,TAXON_CONCEPT_ID,PRIMARY_COM_NAME,SCI_NAME,ORDER,FAMILY,SPECIES_GROUP,REPORT_AS',
      '1,species,testcode,,Test Bird,"Genus species",TestOrder,"Family Name (Sub, Parts)",GroupName,',
    ].join('\n');

    const result = parseEBirdCSV(csv, { filterSpeciesOnly: true });
    expect(result.records.length).toBe(1); // RED until parser updated
    const rec = result.records[0]!;
    expect(rec.speciesCode).toBe('testcode');
    expect(rec.commonName).toBe('Test Bird');
    expect(rec.scientificName).toBe('Genus species');
  });

  it('should correctly parse IBP CSV with quoted scientific name or common name including commas', () => {
    const csv = [
      'SP,B4,SPEC,CONF,B1,COMMONNAME,B2,SCINAME,SPEC6,CONF6',
      ',,ABCD,,,"Comma, Bird",,Genus species,GENSPE,',
    ].join('\n');

    const result = parseIBPCSV(csv);
    expect(result.records.length).toBe(1); // RED until parser updated
    const rec = result.records[0]!;
    expect(rec.alpha4Code).toBe('ABCD');
    expect(rec.commonName).toBe('Comma, Bird');
    expect(rec.scientificName).toBe('Genus species');
  });
});
