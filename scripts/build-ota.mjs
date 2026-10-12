#!/usr/bin/env node
// Đóng gói www/ thành bản cập nhật OTA:  dist/www-<version>.zip  +  dist/latest.json
// (index.html nằm ở GỐC file zip — đúng yêu cầu của plugin cập nhật). Không cần thư viện ngoài.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
import { ROOT, rd } from './lib.mjs';
const v = rd('version.json');
const repo = process.env.GITHUB_REPOSITORY || '__GITHUB_REPOSITORY__';
const WWW = path.join(ROOT, 'www'), DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

function walk(d, base = '') { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name), base + e.name + '/') : [base + e.name]).sort(); }
const crc32 = (buf) => zlib.crc32(buf);   // Node >= 22.2

const files = walk(WWW), parts = [], central = []; let offset = 0;
const dt = new Date(2026, 0, 1), dosTime = (dt.getHours() << 11) | (dt.getMinutes() << 5), dosDate = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
for (const f of files) {
  const data = fs.readFileSync(path.join(WWW, f)); const comp = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(f, 'utf8'), crc = crc32(data) >>> 0;
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  parts.push(lh, name, comp);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
  central.push(ch, name); offset += 30 + name.length + comp.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...parts, cd, end]);
const zipName = `www-${v.version}.zip`; fs.writeFileSync(path.join(DIST, zipName), zip);
const manifest = {
  version: v.version, versionCode: v.versionCode, minNativeVersionCode: v.minNativeVersionCode || 1, notes: v.notes || '',
  url: `https://github.com/${repo}/releases/download/v${v.version}/${zipName}`,
  mirrors: [`https://raw.githubusercontent.com/${repo}/ota/${zipName}`],   // địa chỉ trực tiếp (không chuyển hướng) trên nhánh ota
  sha256: crypto.createHash('sha256').update(zip).digest('hex'), builtAt: new Date().toISOString()
};
fs.writeFileSync(path.join(DIST, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`OTA: dist/${zipName} (${files.length} file, ${(zip.length / 1048576).toFixed(2)} MB) + dist/latest.json`);
