// Versioned genus adjustment data extracted from taxonomy authority drift analyses.
// This file is intentionally data-only (no logic) to support easier diff review.
// Fields:
//  - from: original scientific name as found in one source
//  - to: canonical scientific name to reconcile on
//  - reason: short justification for the adjustment
//  - ebird_version: eBird taxonomy version/year where this form was observed
//  - ibp_version: IBP/AOS list version identifier (e.g., LIST24 / 2024)

export const GENUS_ADJUSTMENT_RULES_V1 = [
  {
    from: 'Astur cooperii',
    to: 'Accipiter cooperii',
    reason:
      "eBird 2024 moved Cooper's Hawk to Astur; IBP retains Accipiter – unify on Accipiter",
    ebird_version: '2024',
    ibp_version: '2024',
  },
  {
    from: 'Astur bicolor',
    to: 'Accipiter bicolor',
    reason: 'Genus reassignment consistency for Bicolored Hawk',
    ebird_version: '2024',
    ibp_version: '2024',
  },
  {
    from: 'Astur chilensis',
    to: 'Accipiter chilensis',
    reason: 'Genus reassignment consistency for Chilean Hawk',
    ebird_version: '2024',
    ibp_version: '2024',
  },
  {
    from: 'Astur gundlachi',
    to: 'Accipiter gundlachi',
    reason: "Genus reassignment consistency for Gundlach's Hawk",
    ebird_version: '2024',
    ibp_version: '2024',
  },
  {
    from: 'Astur gentilis',
    to: 'Accipiter gentilis',
    reason: 'Genus reassignment consistency for Eurasian Goshawk',
    ebird_version: '2024',
    ibp_version: '2024',
  },
] as const;
