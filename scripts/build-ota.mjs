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

// Zip chuẩn như lệnh `zip -r`: có mục thư mục, ghi quyền Unix (0644 file / 0755 thư mục), index.html nằm ở gốc.
// (Plugin giải nén bằng Java; zip thiếu mục thư mục / thiếu thuộc tính dễ gây lỗi khó đoán trên một số máy.)
const files = walk(WWW), dirs = [...new Set(files.flatMap(f => { const p = f.split('/'); p.pop(); return p.map((_, i) => p.slice(0, i + 1).join('/') + '/'); }))].sort();
const entries = [...dirs.map(d => ({ name: d, dir: true })), ...files.map(f => ({ name: f, dir: false }))];
const parts = [], central = []; let offset = 0;
const dt = new Date(2026, 0, 1), dosTime = (dt.getHours() << 11) | (dt.getMinutes() << 5), dosDate = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
for (const e of entries) {
  const data = e.dir ? Buffer.alloc(0) : fs.readFileSync(path.join(WWW, e.name));
  const comp = e.dir ? Buffer.alloc(0) : zlib.deflateRawSync(data, { level: 9 }), method = e.dir ? 0 : 8;
  const name = Buffer.from(e.name, 'utf8'), crc = e.dir ? 0 : (crc32(data) >>> 0);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
  lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  parts.push(lh, name, comp);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
  ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(((e.dir ? 0o40755 : 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
  central.push(ch, name); offset += 30 + name.length + comp.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...parts, cd, end]);
const zipName = `www-${v.version}.zip`; fs.writeFileSync(path.join(DIST, zipName), zip);
// GitHub Releases trả 302 sang máy chủ khác → plugin tải hay lỗi. Nhánh `ota` (raw.githubusercontent.com) trả thẳng 200, không chuyển hướng.
const releaseUrl = `https://github.com/${repo}/releases/download/v${v.version}/${zipName}`;
const directUrl = `https://raw.githubusercontent.com/${repo}/ota/${zipName}`;
const manifest = {
  version: v.version, versionCode: v.versionCode, minNativeVersionCode: v.minNativeVersionCode || 1, notes: v.notes || '',
  url: process.env.OTA_DIRECT === '1' ? directUrl : releaseUrl,
  fallbackUrl: releaseUrl,
  sha256: crypto.createHash('sha256').update(zip).digest('hex'), builtAt: new Date().toISOString()
};
fs.writeFileSync(path.join(DIST, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`OTA: dist/${zipName} (${files.length} file, ${(zip.length / 1048576).toFixed(2)} MB) + dist/latest.json`);
