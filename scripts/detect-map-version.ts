#!/usr/bin/env tsx
// Detect latest mapping CalVer from data/mapping directory and emit GULL_MAP_VERSION= line.
import fs from 'fs';
import path from 'path';
// Use relative import because scripts are outside src/ rootDir.
import { latestMapVersion } from '../src/infrastructure/versioning';

const mappingDir = path.join(process.cwd(), 'data', 'mapping');
if (!fs.existsSync(mappingDir)) {
  console.error(`Mapping directory not found: ${mappingDir}`);
  process.exit(1);
}
const files = fs
  .readdirSync(mappingDir)
  .filter((f) => f.startsWith('map-') && f.endsWith('.json'));
const version = latestMapVersion(files);
if (!version) {
  console.error('No mapping files matching CalVer pattern found.');
  process.exit(1);
}
console.log(`GULL_MAP_VERSION=${version}`);
