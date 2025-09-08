import { describe, it, expect } from 'vitest';
import {
  ACTIVE_GENUS_ADJUSTMENTS,
  applyGenusAdjustments,
} from '@etl/genus-adjustments';
import { isValidScientificName, createScientificName } from '@domain/types';

describe('Genus Adjustments (versioned)', () => {
  it('exposes semantic version and source data versions', () => {
    expect(ACTIVE_GENUS_ADJUSTMENTS.version).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(ACTIVE_GENUS_ADJUSTMENTS.ebirdDataVersion).toBe('2024');
    expect(ACTIVE_GENUS_ADJUSTMENTS.ibpDataVersion).toBe('2024');
  });

  it('applies known genus drift mapping with rule version metadata', () => {
    const raw = 'Astur cooperii';
    const adjusted = applyGenusAdjustments(raw);
    expect(adjusted).toBe('Accipiter cooperii');
    expect(isValidScientificName(adjusted)).toBe(true);
    expect(() => createScientificName(adjusted)).not.toThrow();
    const rule = ACTIVE_GENUS_ADJUSTMENTS.rules.find((r) => r.from === raw)!;
    expect(rule.ebird_version).toBe('2024');
    expect(rule.ibp_version).toBe('2024');
  });

  it('is idempotent for non-adjusted names', () => {
    const name = 'Corvus brachyrhynchos';
    expect(applyGenusAdjustments(name)).toBe(name);
  });

  it('does not alter trinomial without rule', () => {
    const trinomial = 'Larus glaucoides kumlieni';
    expect(applyGenusAdjustments(trinomial)).toBe(trinomial);
  });
});
