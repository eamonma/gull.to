#!/usr/bin/env tsx
// Minimal synthetic check script used in CI after deployment.
import { setTimeout as delay } from 'timers/promises';

const base = process.argv[2];
if (!base) {
  console.error('Usage: synthetic-check <baseUrl>');
  process.exit(2);
}

interface CheckResult {
  name: string;
  ok: boolean;
  details?: string;
}

async function head(url: string) {
  const res = await fetch(url, { method: 'GET', redirect: 'manual' });
  return res;
}

async function run(): Promise<number> {
  const results: CheckResult[] = [];
  const golden = 'AMCR';

  const species = await head(`${base}/g/${golden}`);
  results.push({
    name: 'golden redirect status',
    ok: species.status === 302,
    details: `status=${species.status}`,
  });
  results.push({
    name: 'golden has version headers',
    ok:
      !!species.headers.get('X-Gull-Worker') &&
      !!species.headers.get('X-Gull-Map'),
  });

  const unknown = await head(`${base}/g/QQQQ`);
  results.push({ name: 'unknown fallback status', ok: unknown.status === 302 });
  results.push({
    name: 'unknown Location home',
    ok: /^https:\/\/birdsoftheworld\.org\/?$/.test(
      unknown.headers.get('Location') || ''
    ),
  });

  const health = await head(`${base}/g/_health`);
  let healthOk = false;
  try {
    const txt = await health.text();
    healthOk = health.status === 200 && /"status"\s*:\s*"ok"/.test(txt);
  } catch {
    /* ignore */
  }
  results.push({ name: 'health ok', ok: healthOk });

  const failures = results.filter((r) => !r.ok);
  results.forEach((r) =>
    console.log(
      `${r.ok ? '✅' : '❌'} ${r.name}${r.details ? ' - ' + r.details : ''}`
    )
  );
  if (failures.length > 0) {
    console.error(
      `Synthetic check failed: ${failures.map((f) => f.name).join(', ')}`
    );
    return 1;
  }
  return 0;
}

run().then((code) => process.exit(code));
