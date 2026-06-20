// Minimal .env loader (no dependency). Loads repo-root .env into process.env if
// present and not already set. No-op in production where env is injected.
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const p = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(p)) {
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
