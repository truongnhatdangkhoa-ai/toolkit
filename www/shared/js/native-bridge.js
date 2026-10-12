/* Cầu nối Android (Capacitor): WebView Android KHÔNG tự tải được file tạo bằng blob/data URL
   (a.download + click). Tệp này chặn thao tác đó và lưu file vào bộ nhớ đệm rồi mở hộp thoại
   "Chia sẻ / Lưu vào…" của Android. Trên trình duyệt thường thì không làm gì.
   Nạp ở vỏ (index.html) và trong từng app (iframe) — iframe lấy Capacitor từ trang cha. */
(function () {
  'use strict';
  var C = window.Capacitor;
  try { if (!C && window.parent && window.parent !== window) C = window.parent.Capacitor; } catch (e) {}
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var P = C.Plugins || {}, FS = P.Filesystem, SH = P.Share;
  if (!FS || !SH) return;

  function toB64(blob) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = bad; r.readAsDataURL(blob);
    });
  }
  function handle(href, name) {
    var safe = String(name || 'tep').replace(/[\\/:*?"<>|]+/g, '_');
    return fetch(href).then(function (r) { return r.blob(); }).then(toB64).then(function (data) {
      return FS.writeFile({ path: safe, data: data, directory: 'CACHE', recursive: true });
    }).then(function (res) {
      return SH.share({ title: safe, url: res.uri, dialogTitle: 'Lưu hoặc chia sẻ: ' + safe });
    });
  }
  function isDl(a) { return a && a.hasAttribute && a.hasAttribute('download') && /^(blob:|data:)/.test(a.href || ''); }

  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var a = this;
    if (isDl(a)) { var h = a.href, n = a.getAttribute('download'); handle(h, n).catch(function () {}); return; }
    return origClick.apply(a, arguments);
  };
  // một số thư viện (FileSaver) phát sự kiện click thay vì gọi click()
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (isDl(a)) { e.preventDefault(); handle(a.href, a.getAttribute('download')).catch(function () {}); }
  }, true);
})();
