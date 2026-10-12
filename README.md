# ToolKit Manager — Scan tài liệu + Container 3D (Capacitor / Android)

App gồm 2 công cụ chạy hoàn toàn offline trên máy: **Scan tài liệu** (chụp/chọn ảnh hoặc PDF → cắt trang, khử bóng → xuất PDF/JPG)
và **Container 3D** (xếp hàng vào container, xuất Excel/ảnh 3D). Đóng gói thành APK/AAB bằng **Capacitor 8**.

## 1. Cấu trúc thư mục

```
www/                      ← toàn bộ giao diện web (đây là phần được cập nhật tự động OTA)
  index.html              vỏ 2 tab + logo + số phiên bản
  css/shell.css  js/shell.js  js/updater.js  js/update-config.js
  shared/                 phần dùng chung 2 app: css/fonts.css, css/kl-ds.css, fonts/*.woff2, js/theme-sync.js, js/native-bridge.js
  apps/scan/              index.html + css/ + js/ (scan-core, scan-ui…) + js/vendor/ (pdf.js, jsPDF, JSZip)
  apps/c3d/               index.html + css/ + js/ (c3d-engine, c3d-view, c3d-ui…) + js/vendor/ (three.js, xlsx)
  assets/                 logo.png, logo-192.png, favicon.png
  version.json            (tự sinh khi tăng phiên bản)
resources/                logo gốc + icon/splash Android đã sinh sẵn (resources/android/res)
scripts/                  bump-version, build-ota, setup-android, make-keystore, serve
tools/                    cut_logo.py, make_icons.py  (đổi logo/icon)
.github/workflows/android-release.yml   build APK + AAB + gói OTA, tạo bản phát hành
capacitor.config.json     appId, tên app, cấu hình cập nhật
version.json              NGUỒN DUY NHẤT của số phiên bản
```
Thư mục `android/` **không** lưu trong repo: được sinh lại mỗi lần build bằng `scripts/setup-android.mjs`
(chép icon/splash, đặt versionCode, khai báo quyền camera, cấu hình ký). Muốn chỉnh native lâu dài thì sửa file đó.

## 2. Chạy thử trên máy (không cần Android)
```
npm run serve        # mở http://localhost:8080
```

## 3. Đưa lên GitHub và phát hành APK / AAB
1. Tạo repo GitHub (nên để **Public** — xem mục 5), đẩy toàn bộ thư mục này lên nhánh `main`.
2. **Tạo khoá ký (làm 1 lần):** `bash scripts/make-keystore.sh` (cần Java `keytool`) → tạo 4 *Secrets* trong
   Settings → Secrets and variables → Actions: `KLA_KEYSTORE_B64`, `KLA_KEYSTORE_PASSWORD`, `KLA_KEY_ALIAS`, `KLA_KEY_PASSWORD`.
   **Cất file `.keystore` + mật khẩu thật kỹ** — mất là không cập nhật được app trên Google Play.
   Chưa có khoá: workflow vẫn chạy nhưng chỉ ra **APK debug** (cài thử được, không up Google Play được, không có AAB).
3. Tab **Actions → "Phát hành Android" → Run workflow**, chọn:
   - `bump`: patch / minor / major (tự tăng version + versionCode, commit và gắn tag `vX.Y.Z`)
   - `native_changes`: tick nếu lần này đổi **icon, quyền, plugin** (xem mục 4)
   - `build_android`: bỏ tick = chỉ phát hành bản cập nhật OTA (nhanh, ~1 phút)
   - `notes`: ghi chú hiện cho người dùng khi cập nhật
4. Kết quả nằm ở **Releases**: `ToolKitManager-X.Y.Z.apk`, `ToolKitManager-X.Y.Z.aab` (up Google Play), `www-X.Y.Z.zip`, `latest.json`.

## 4. Cập nhật tự động — không cần build lại
App đọc `releases/latest/download/latest.json`; nếu có bản mới hơn thì tải `www-X.Y.Z.zip` và hỏi
**"Cập nhật ngay / Để lần mở sau"**. Tự kiểm tra khi mở app, khi quay lại app và mỗi 6 giờ.

| Thay đổi | Cách phát hành |
|---|---|
| Sửa chức năng, giao diện, CSS/JS, logo hiển thị trong app | Chỉ cần chạy workflow (`build_android` bỏ tick nếu muốn nhanh) — người dùng nhận qua OTA |
| **Icon ngoài màn hình chính, splash, quyền, thêm plugin native** | Tick `native_changes` + build APK/AAB mới. Máy dùng bản cũ sẽ thấy thông báo "cần cài lại ứng dụng" |

Gói OTA còn được đẩy lên nhánh `ota` (tải trực tiếp, không chuyển hướng) để dự phòng khi GitHub Releases tải lỗi.

Giới hạn của Android: icon launcher nằm trong APK nên không thể đổi bằng OTA. Bản OTA bị lỗi/treo > 15 giây sẽ tự lùi về bản trước.

## 5. Phiên bản
- Nguồn duy nhất: `version.json` → đồng bộ sang `package.json`, `www/version.json`, `versionName`/`versionCode` Android.
- `versionCode` luôn +1 mỗi lần phát hành (Google Play bắt buộc tăng).
- Tăng tay trên máy: `npm run bump:patch` (hoặc `bump:minor`, `bump:major`; thêm `-- --native --notes "Nội dung"`).
- Repo **private**: app không đọc được `latest.json` công khai → OTA không hoạt động (APK vẫn tải thủ công được). Cần OTA thì để repo public hoặc đặt `latest.json` + zip ở nơi công khai khác rồi sửa `www/js/update-config.js`.

## 6. Đổi logo / icon sau này
1. Thay `resources/logo-source.png` (ảnh có nền ô caro hoặc nền trắng cũng được) bằng logo mới.
2. `pip install pillow numpy scipy`, rồi:
   ```
   python3 tools/cut_logo.py resources/logo-source.png resources/logo-transparent.png
   python3 tools/make_icons.py .
   ```
3. Commit + chạy workflow với `native_changes` tick. Logo trong app (`www/assets/`) cập nhật cả qua OTA; icon màn hình chính cần APK mới.
Ảnh icon 512×512 cho Google Play: `resources/play-store-icon-512.png`.

## 7. Đổi tên gói ứng dụng
`appId` hiện là `com.kholanh.scancontainer3d` (trong `capacitor.config.json`). **Đổi trước khi up Google Play lần đầu** — sau đó không đổi được.

## 8. Lưu file trên Android
WebView Android không tự tải được file tạo trong trình duyệt. `shared/js/native-bridge.js` chặn thao tác tải xuống (PDF, Excel, ảnh…)
và mở hộp thoại **Chia sẻ / Lưu vào…** của Android (chọn "Lưu vào Tệp" để lưu).
