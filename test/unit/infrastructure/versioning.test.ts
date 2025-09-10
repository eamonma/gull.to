import { describe, it, expect } from 'vitest';
import {
  parseMapVersionFromFilename,
  latestMapVersion,
  resolveVersions,
} from '@infrastructure/versioning';

describe('versioning utilities', () => {
  it('parses valid map filenames', () => {
    expect(parseMapVersionFromFilename('map-2024.09.json')).toBe('2024.09');
    expect(parseMapVersionFromFilename('map-2025.01.15.json')).toBe(
      '2025.01.15'
    );
    expect(parseMapVersionFromFilename('map-2025.02-hotfix.2.json')).toBe(
      '2025.02-hotfix.2'
    );
  });

  it('rejects invalid filenames', () => {
    expect(parseMapVersionFromFilename('map-24.09.json')).toBeNull();
    expect(parseMapVersionFromFilename('not-a-map.json')).toBeNull();
  });

  it('selects latest map version by CalVer ordering with hotfix precedence', () => {
    const files = [
      'map-2024.09.json',
      'map-2024.10-hotfix.1.json',
      'map-2024.10.json',
      'map-2024.10-hotfix.2.json',
      'map-2025.01.json',
    ];
    expect(latestMapVersion(files)).toBe('2025.01');
  });

  it('prefers higher hotfix number for same date', () => {
    const files = [
      'map-2025.03-hotfix.1.json',
      'map-2025.03-hotfix.3.json',
      'map-2025.03.json',
    ];
    expect(latestMapVersion(files)).toBe('2025.03-hotfix.3');
  });

  it('resolves versions from environment with fallbacks', () => {
    const env = { GULL_WORKER_VERSION: 'v2.0.0', GULL_MAP_VERSION: '2025.03' };
    const resolved = resolveVersions(env, { worker: 'v0.0.1', map: '2024.09' });
    expect(resolved.workerVersion).toBe('v2.0.0');
    expect(resolved.mapVersion).toBe('2025.03');
  });

  it('uses defaults when env unset or blank', () => {
    const env = { GULL_WORKER_VERSION: '   ' } as any; // map missing
    const resolved = resolveVersions(env, { worker: 'v0.0.1', map: '2024.09' });
    expect(resolved.workerVersion).toBe('v0.0.1');
    expect(resolved.mapVersion).toBe('2024.09');
  });
});
