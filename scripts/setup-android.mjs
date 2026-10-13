#!/usr/bin/env node
// Dựng / làm mới dự án Android từ cấu hình (idempotent — chạy lại bao nhiêu lần cũng được):
//   1) nếu chưa có android/ -> `npx cap add android`
//   2) chép icon + splash từ resources/android/res
//   3) đặt versionCode/versionName từ version.json
//   4) khai báo quyền CAMERA (Scan tài liệu) + cấu hình ký bản release (khi có keystore)
//   5) `npx cap sync android`
// Mọi chỉnh sửa native muốn GIỮ LẠI lâu dài hãy thêm vào file này (thư mục android/ được sinh lại).
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
import { ROOT, rd } from './lib.mjs';
const A = path.join(ROOT, 'android'), RES = path.join(A, 'app/src/main/res');
const DRY = !!process.env.KL_SKIP_CAP;                       // chỉ dùng khi kiểm thử script (không gọi Capacitor CLI)
const sh = (c) => DRY ? console.log('[bỏ qua]', c) : execSync(c, { cwd: ROOT, stdio: 'inherit' });
const warn = (m) => console.warn('⚠ ' + m);
const exists = (p) => fs.existsSync(p);

if (!exists(A)) sh('npx cap add android');

// 2) icon + splash
if (!exists(path.join(ROOT, 'resources/android/res/mipmap-xxxhdpi/ic_launcher.png'))) {
  console.error('✗ Thiếu thư mục resources/android/res (icon + splash). Hãy chắc chắn đã đưa lên repo — nếu dùng git, kiểm tra .gitignore không chặn nó (dùng "/android/" chứ không phải "android/").');
  process.exit(1);
}
function copyDir(src, dst) { for (const e of fs.readdirSync(src, { withFileTypes: true })) {
  const s = path.join(src, e.name), d = path.join(dst, e.name);
  if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); } else fs.copyFileSync(s, d); } }
function rmIf(p) { if (exists(p)) fs.rmSync(p, { force: true }); }
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
for (const f of walk(RES)) {                         // bỏ icon/splash mặc định của Capacitor để không trùng tài nguyên
  const rel = path.relative(RES, f).replace(/\\/g, '/');
  if (/^drawable[^/]*\/splash\.png$/.test(rel)) rmIf(f);
  if (/^mipmap-[^/]+\/ic_launcher(_round|_foreground)?\.png$/.test(rel)) rmIf(f);
}
rmIf(path.join(RES, 'drawable-v24/ic_launcher_foreground.xml')); rmIf(path.join(RES, 'drawable/ic_launcher_background.xml'));
copyDir(path.join(ROOT, 'resources/android/res'), RES);

// 3) phiên bản
const v = rd('version.json');
const gradle = path.join(A, 'app/build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
g = g.replace(/(versionCode\s*=?\s*)\d+/, `$1${v.versionCode}`).replace(/(versionName\s*=?\s*)"[^"]*"/, `$1"${v.version}"`);
if (!new RegExp(`versionCode\\s*=?\\s*${v.versionCode}\\b`).test(g) || !g.includes(`"${v.version}"`)) { console.error('✗ Không đặt được versionCode/versionName trong build.gradle'); process.exit(1); }
// 4b) ký bản release khi có biến môi trường (CI tự đặt)
const MARK = '// >>> KL signing';
if (!g.includes(MARK)) g += `\n${MARK}\napply from: 'signing.gradle'\n// <<< KL signing\n`;
fs.writeFileSync(gradle, g);
const DEBUG_KS = path.join(ROOT, 'resources/android/kl-debug.keystore').replace(/\\/g, '/');
if (!exists(DEBUG_KS)) { console.error('✗ Thiếu resources/android/kl-debug.keystore (khoá ký bản debug cố định). Hãy đưa file này lên repo.'); process.exit(1); }
fs.writeFileSync(path.join(A, 'app/signing.gradle'), `// Sinh bởi scripts/setup-android.mjs — ký bản release nếu có keystore (biến môi trường do CI đặt).
def ksFile = System.getenv("KLA_KEYSTORE_FILE")
if (ksFile && new File(ksFile).exists()) {
    android {
        signingConfigs {
            klaRelease {
                storeFile new File(ksFile)
                storePassword System.getenv("KLA_KEYSTORE_PASSWORD")
                keyAlias System.getenv("KLA_KEY_ALIAS")
                keyPassword System.getenv("KLA_KEY_PASSWORD")
            }
        }
        buildTypes { release { signingConfig signingConfigs.klaRelease } }
    }
} else {
    // Không có khoá release: ký bản debug bằng khoá cố định trong repo → mọi bản APK cài đè lên nhau được (không bị lỗi "chữ ký khác").
    // Chỉ để cài trực tiếp; KHÔNG dùng được để đưa lên Google Play (cần khoá release riêng).
    android {
        signingConfigs {
            klaDebug {
                storeFile new File("${DEBUG_KS}")
                storePassword "android"
                keyAlias "kldebug"
                keyPassword "android"
            }
        }
        buildTypes { debug { signingConfig signingConfigs.klaDebug } }
    }
}
`);

// 4a) quyền camera
const mf = path.join(A, 'app/src/main/AndroidManifest.xml');
let m = fs.readFileSync(mf, 'utf8');
if (!m.includes('android.permission.CAMERA')) {
  const add = '    <uses-permission android:name="android.permission.CAMERA" />\n' +
              '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n' +
              '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />\n';
  if (m.includes('</manifest>')) { m = m.replace('</manifest>', add + '</manifest>'); fs.writeFileSync(mf, m); }
  else warn('AndroidManifest.xml bất thường — chưa thêm quyền CAMERA');
}

// 4c) tên hiển thị của app (nhãn dưới icon + tên Activity) — luôn là "ToolKit Manager", không phụ thuộc bản cũ
{
  const NAME = rd('capacitor.config.json').appName || 'ToolKit Manager';
  const sf = path.join(RES, 'values/strings.xml');
  if (exists(sf)) {
    let x = fs.readFileSync(sf, 'utf8'); const esc = NAME.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    x = x.replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${esc}$2`).replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${esc}$2`);
    fs.writeFileSync(sf, x);
  } else warn('Không thấy res/values/strings.xml — chưa đặt tên app');
}

// 5) đồng bộ web -> android
sh('npx cap sync android');
console.log(`Android sẵn sàng: ${v.version} (versionCode ${v.versionCode})`);
