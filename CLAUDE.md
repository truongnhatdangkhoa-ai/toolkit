# Ghi chú cho Claude — dự án ToolKit Manager (Capacitor / Android)

## Quy ước giao file (BẮT BUỘC)
Mỗi lần sửa dự án, luôn gửi **2 file zip**:
1. **`..._SUA.zip`** — chỉ chứa **các file đã sửa/thêm** (giữ đúng đường dẫn thư mục) để chép đè lên repo GitHub.
2. **`..._FULL.zip`** — **toàn bộ dự án hoàn chỉnh** để lưu trữ.
Kèm danh sách file đã sửa trong câu trả lời. Đặt tên có số bản, ví dụ `Scan_Container3D_v1.0.5_SUA.zip` / `..._FULL.zip`.

## Tổng quan
- Giao diện web trong `www/` (2 app chạy trong iframe: `apps/scan`, `apps/c3d`), đóng gói Android bằng Capacitor 8.
- Thư mục `android/` KHÔNG lưu trong repo; được sinh lại mỗi lần build bởi `scripts/setup-android.mjs` (muốn chỉnh native lâu dài thì sửa file này).
- Phát hành: GitHub → Actions → "Phát hành Android (APK + AAB + OTA)" (nhánh `kho-anan`). Workflow tự tăng phiên bản, commit, gắn tag.
- Chỉ sửa giao diện web: bỏ tick "Build APK + AAB" để phát hành OTA nhanh (máy phải có bản cài ≥ v1.0.4 mới nhận OTA). Đổi icon/quyền/plugin: tick "native_changes" và build APK mới.
- Tự động: push thay đổi trong `www/**` lên `main`/`kho-anan` → workflow tự chạy (patch, chỉ OTA, ghi chú = nội dung commit). Commit bump version có `[skip ci]` và dùng GITHUB_TOKEN nên không lặp vô hạn. Build APK/AAB vẫn chạy tay.
- Chưa có secret khoá ký → chỉ ra APK debug (`...-debug.apk`), không có AAB.

## Giao diện
- Trong app Android, thanh menu trên cùng (`.bar`) bị ẩn (`body.autohide`); chạm thanh nhỏ ở giữa mép trên để mở, chọn xong tự đóng. Thêm `?bar=hide` vào địa chỉ để thử trên trình duyệt.
- Chạy thử web: `npm run serve` (http://localhost:8080). Đã kiểm tra bố cục ở 412–1280px: ≥900px chia 2 cột, nhỏ hơn xếp 1 cột.
- iPad/iOS: APK không chạy được; cần dự án iOS riêng hoặc PWA (chưa làm).
- OTA: `www/js/updater.js` hiện % tải, tự báo lỗi nếu đứng >30 giây hoặc >3 phút, có nút Thử lại / Mở trang tải. Lưu ý: code updater nằm trong www nên máy cũ chỉ nhận được qua OTA hoặc APK mới → sửa updater thì nên build APK mới.
- `capacitor.config.json`: CapacitorUpdater `statsUrl:""` (không gửi thống kê tới plugin.capgo.app) và `responseTimeout:60`. Là cấu hình native → cần build APK mới mới có tác dụng. Nếu OTA vẫn treo: cài thẳng APK mới nhất từ Releases (APK luôn chứa bản www mới nhất) và xem log bằng chrome://inspect.
- Logo/icon nền TRẮNG: sửa `BG` trong `tools/make_icons.py` rồi chạy `python3 -I tools/make_icons.py .`; màu nền icon/splash nằm ở `resources/android/res/values/ic_launcher_background.xml`. Đổi icon là thay đổi native → tick "native_changes" + build APK mới.
- Màn hình chính (`#home`) chỉ hiện trong app Android: 2 thẻ chọn công cụ; nút Back của điện thoại: đang ở công cụ → về màn hình chính, đang ở màn hình chính → thoát app (`backButton` trong shell.js). Thanh menu trên cùng không còn dùng trong app (chỉ còn trên web).
- OTA: GitHub trả 302 sang release-assets.githubusercontent.com, plugin Capgo tải trực tiếp URL github.com bị lỗi "Failed to download" → `updater.js` tự lấy địa chỉ đích (`disableRedirects`) rồi mới `download`. Sửa updater/shell là sửa trong www nhưng máy đang kẹt cần APK mới mới nhận được.
- Tên app: "ToolKit Manager" (capacitor.config.json `appName`, tiêu đề www/index.html, file APK `ToolKitManager-X.Y.Z.apk/.aab`, release "ToolKit Manager vX"). KHÔNG đổi `appId` (com.kholanh.scancontainer3d) vì đổi sẽ coi như app khác, mất dữ liệu/cập nhật.
- OTA v1.0.12 (sửa lỗi "Failed to download" dai dẳng): `latest.json` giờ có `url` = `https://raw.githubusercontent.com/<repo>/ota/www-X.Y.Z.zip` (nhánh `ota`, workflow tự đẩy lên bằng force-push orphan; trả thẳng 200, KHÔNG chuyển hướng 302) và `fallbackUrl` = GitHub Releases. Máy cũ (updater cũ) chỉ đọc `url` nên cũng hưởng lợi mà không cần APK mới. `scripts/build-ota.mjs` tạo zip có mục thư mục + quyền Unix (đã thử giải nén bằng Java ZipInputStream). `updater.js` mới: thử lần lượt [url → đích sau 302 → fallbackUrl], xoá bản tải dở trước mỗi lần thử, khi lỗi hiện dòng "Chẩn đoán: HTTP … · đúng/không phải file zip" để biết lỗi do mạng/file hay do plugin. Repo phải PUBLIC.
- Container 3D, màn hình dọc: lỗi form "Thêm mặt hàng" kéo dài sang 1 bên do `grid-template-columns:1fr` (= minmax(auto,1fr)) bị phần tử rộng nhất đẩy ra ~1300px → đã đổi thành `minmax(0,1fr)` + `min-width:0` (cuối `c3d-redesign.css`, khối "v1.0.12"). Thử bằng Chromium headless ở 320–768px: không còn tràn ngang. Khi thêm UI mới cho c3d luôn thử ở 360px.
- Tên app: đã đổi hết chuỗi hiển thị còn sót ("Kho Lạnh" → "ToolKit Manager"); `setup-android.mjs` ép `app_name`/`title_activity_main` = appName. Nhãn dưới icon chỉ đổi khi build APK mới.

