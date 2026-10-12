import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
export const wr = (f, o) => fs.writeFileSync(path.join(ROOT, f), JSON.stringify(o, null, 2) + '\n');
export function writeWebVersion(v) {            // www/version.json: app đọc để hiện số phiên bản + so sánh OTA
  wr('www/version.json', { version: v.version, versionCode: v.versionCode, notes: v.notes || '', builtAt: new Date().toISOString() });
}
