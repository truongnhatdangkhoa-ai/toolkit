/* Cấu hình cập nhật tự động (OTA).
   __GITHUB_REPOSITORY__ được GitHub Actions tự thay bằng "chu-so-huu/ten-repo" khi build.
   Khi chạy thử trên máy, giữ nguyên chuỗi này thì tính năng cập nhật tự tắt. */
window.KL_UPDATE = {
  repo: '__GITHUB_REPOSITORY__',
  manifestUrl: 'https://github.com/__GITHUB_REPOSITORY__/releases/latest/download/latest.json',
  releasesUrl: 'https://github.com/__GITHUB_REPOSITORY__/releases/latest',
  checkEveryMs: 6 * 60 * 60 * 1000   // kiểm tra lại mỗi 6 giờ khi app đang mở
};
