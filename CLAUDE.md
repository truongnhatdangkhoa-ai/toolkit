# Ghi chú cho Claude — dự án Scan & Container 3D (Capacitor / Android)

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
