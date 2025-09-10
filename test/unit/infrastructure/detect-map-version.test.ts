import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { latestMapVersion } from '@infrastructure/versioning';

describe('detect-map-version script logic', () => {
  it('finds latest map version from mapping directory', () => {
    const dir = path.join(process.cwd(), 'data', 'mapping');
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('map-'));
    const v = latestMapVersion(files);
    expect(v).toMatch(/^\d{4}\.\d{2}/);
  });
});
