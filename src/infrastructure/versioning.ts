// Versioning utilities for worker & map versions.
// Provides CalVer parsing and latest version selection used by CI scripts & tests.
import { CALVER_PATTERN } from '@etl/config';

export const CALVER_REGEX = CALVER_PATTERN; // re-export for convenience

export function parseMapVersionFromFilename(fileName: string): string | null {
  const regex = /^map-(\d{4}\.\d{2}(?:\.\d{2})?(?:-hotfix\.\d+)?).json$/;
  const match = fileName.match(regex);
  return match && typeof match[1] === 'string' ? match[1] : null;
}

export interface VersionSortKey {
  year: number;
  month: number;
  day: number;
  hotfix: number;
  raw: string;
}

function toSortKey(v: string): VersionSortKey | null {
  if (!CALVER_REGEX.test(v)) return null;
  const split = v.split('-hotfix.');
  const datePart = split[0] ?? '';
  const hotfixPart = split.length > 1 ? split[1] : undefined;
  const parts = datePart.split('.');
  const year = Number.parseInt(parts[0] ?? '', 10);
  const month = Number.parseInt(parts[1] ?? '', 10);
  const day = parts[2] ? Number.parseInt(parts[2], 10) : 0; // treat missing day as 0 for ordering
  const hotfix = hotfixPart ? Number.parseInt(hotfixPart, 10) : 0;
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hotfix)
  ) {
    return null;
  }
  return { year, month, day, hotfix, raw: v };
}

export function latestMapVersion(fileNames: string[]): string | null {
  const versions: VersionSortKey[] = [];
  for (const f of fileNames) {
    const v = parseMapVersionFromFilename(f);
    if (v) {
      const key = toSortKey(v);
      if (key) versions.push(key);
    }
  }
  if (versions.length === 0) return null;
  versions.sort((a, b) =>
    a.year !== b.year
      ? b.year - a.year
      : a.month !== b.month
        ? b.month - a.month
        : a.day !== b.day
          ? b.day - a.day
          : a.hotfix !== b.hotfix
            ? b.hotfix - a.hotfix
            : 0
  );
  const first = versions[0];
  return first ? first.raw : null;
}

// Resolve worker + map versions from environment (fallbacks provided).
export interface ResolvedVersions {
  readonly workerVersion: string;
  readonly mapVersion: string;
}

export function resolveVersions(
  env: Record<string, unknown>,
  defaults: { worker: string; map: string }
): ResolvedVersions {
  const workerRaw = env['GULL_WORKER_VERSION'];
  const mapRaw = env['GULL_MAP_VERSION'];
  const workerVersion =
    typeof workerRaw === 'string' && workerRaw.trim() !== ''
      ? workerRaw
      : defaults.worker;
  const mapVersion =
    typeof mapRaw === 'string' && mapRaw.trim() !== '' ? mapRaw : defaults.map;
  return { workerVersion, mapVersion };
}
