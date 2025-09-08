import { GENUS_ADJUSTMENT_RULES_V1 } from './genus-adjustments.data';

export interface GenusAdjustmentRule {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly ebird_version: string;
  readonly ibp_version: string;
}

export interface GenusAdjustmentSet {
  readonly version: string; // semantic version (vMAJOR.MINOR.PATCH)
  readonly ebirdDataVersion: string; // eBird taxonomy year
  readonly ibpDataVersion: string; // IBP list year
  readonly rules: readonly GenusAdjustmentRule[];
}

export const GENUS_ADJUSTMENTS_V1: GenusAdjustmentSet = {
  version: 'v1.1.0',
  ebirdDataVersion: '2024',
  ibpDataVersion: '2024',
  rules: GENUS_ADJUSTMENT_RULES_V1 as unknown as GenusAdjustmentRule[],
};

export const ACTIVE_GENUS_ADJUSTMENTS = GENUS_ADJUSTMENTS_V1;

const GENUS_ADJUSTMENT_MAP: ReadonlyMap<string, string> = new Map(
  ACTIVE_GENUS_ADJUSTMENTS.rules.map((r) => [r.from, r.to])
);

export function applyGenusAdjustments(scientificName: string): string {
  return GENUS_ADJUSTMENT_MAP.get(scientificName) || scientificName;
}
