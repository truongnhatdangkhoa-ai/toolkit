#!/usr/bin/env node
// Tăng phiên bản ở MỘT chỗ (version.json) rồi đồng bộ sang package.json + www/version.json.
//   node scripts/bump-version.mjs patch|minor|major [--native] [--notes "Nội dung"]
//   node scripts/bump-version.mjs set 1.4.0 [--native]
//   node scripts/bump-version.mjs sync            (chỉ đồng bộ, không tăng)
// versionCode (Android) luôn +1 mỗi lần bump. --native = bản này có thay đổi phần native (icon/quyền/plugin)
// -> bản cài cũ KHÔNG được OTA lên bản này, buộc cài APK/AAB mới (minNativeVersionCode = versionCode).
import fs from 'node:fs';
import { rd, wr, writeWebVersion } from './lib.mjs';
const args = process.argv.slice(2);
const kind = args[0] || 'patch';
const native = args.includes('--native');
const ni = args.indexOf('--notes'); const notes = ni >= 0 ? args[ni + 1] : undefined;
const v = rd('version.json');
if (kind !== 'sync') {
  let [a, b, c] = v.version.split('.').map(Number);
  if (kind === 'major') { a++; b = 0; c = 0; }
  else if (kind === 'minor') { b++; c = 0; }
  else if (kind === 'patch') { c++; }
  else if (kind === 'set') {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(args[1] || ''); if (!m) { console.error('Dùng: set X.Y.Z'); process.exit(1); }
    [a, b, c] = [+m[1], +m[2], +m[3]];
  } else { console.error('Lệnh không hợp lệ:', kind); process.exit(1); }
  v.version = `${a}.${b}.${c}`; v.versionCode = (v.versionCode || 0) + 1;
  if (native) v.minNativeVersionCode = v.versionCode;
  if (notes !== undefined) v.notes = notes;
  wr('version.json', v);
}
const pkg = rd('package.json'); pkg.version = v.version; wr('package.json', pkg);
writeWebVersion(v);
console.log(`version ${v.version} (versionCode ${v.versionCode}, minNative ${v.minNativeVersionCode})`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${v.version}\nversionCode=${v.versionCode}\n`);
