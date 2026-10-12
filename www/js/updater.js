/* Cập nhật tự động (OTA) — thay phần web (chức năng, giao diện, logo trong app) KHÔNG cần cài lại APK.
   Cơ chế: đọc latest.json ở bản phát hành mới nhất trên GitHub -> tải www-x.y.z.zip -> áp dụng.
   Chỉ chạy trong app Android (Capacitor). Icon trên màn hình chính và quyền hệ thống là phần native,
   muốn đổi phải phát hành bản "full" (APK/AAB mới). */
(function () {
  'use strict';
  var C = window.Capacitor;
  var cfg = window.KL_UPDATE || {};
  var verEl = document.getElementById('ver'), box = document.getElementById('upd');

  function localVersion() {
    return fetch('version.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }
  localVersion().then(function (v) { if (v && verEl) verEl.textContent = 'v' + v.version; });

  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;           // chạy trên web: bỏ qua
  var P = C.Plugins || {}, U = P.CapacitorUpdater, H = P.CapacitorHttp, A = P.App;
  if (!U || !H) return;
  if (!cfg.repo || /__GITHUB_REPOSITORY__/.test(cfg.repo)) { try { U.notifyAppReady(); } catch (e) {} return; }

  try { U.notifyAppReady(); } catch (e) {}                                   // báo "bản này chạy ổn" -> không bị tự lùi bản

  function cmp(a, b) {                                                       // so sánh x.y.z
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  function show(html, buttons) {
    box.innerHTML = '<span class="msg">' + html + '</span>'; box.hidden = false;
    (buttons || []).forEach(function (b) {
      var el = document.createElement('button'); el.textContent = b.t; if (b.go) el.className = 'go';
      el.onclick = function () { b.f(); }; box.appendChild(el);
    });
  }
  function hide() { box.hidden = true; box.innerHTML = ''; }


  // Tải bản mới có hiển thị % và tự dừng nếu bị treo (không có tiến độ trong 30 giây hoặc quá 3 phút)
  var STALL_MS = 30000, TOTAL_MS = 180000;
  function downloadBundle(m) {
    var pct = 0, last = Date.now(), t0 = Date.now(), done = false, lis = null, timer = null;
    function label() { return 'Đang tải bản <b>v' + m.version + '</b>… ' + pct + '%'; }
    show(label());
    function stop() { done = true; clearInterval(timer); if (lis && lis.remove) { try { lis.remove(); } catch (e) {} } }
    function fail(msg) {
      stop(); busy = false;
      show(msg + ' Kiểm tra mạng rồi thử lại.', [
        { t: 'Thử lại', go: true, f: function () { check(true); } },
        { t: 'Mở trang tải', f: function () { window.open(cfg.releasesUrl, '_system'); } },
        { t: 'Đóng', f: hide }]);
    }
    return new Promise(function (resolve, reject) {
      try { var l = U.addListener('download', function (ev) {
        if (done || !ev) return; var p = Math.round(ev.percent || 0); if (p !== pct) { pct = p; last = Date.now(); show(label()); }
      }); if (l && l.then) l.then(function (h) { lis = h; if (done && h && h.remove) h.remove(); }); else lis = l; } catch (e) {}
      timer = setInterval(function () {
        if (done) return;
        if (Date.now() - last > STALL_MS) { reject(new Error('Tải bị đứng (không có tiến độ).')); }
        else if (Date.now() - t0 > TOTAL_MS) { reject(new Error('Tải quá lâu.')); }
      }, 2000);
      U.download({ url: m.url, version: m.version }).then(resolve, reject);
    }).then(function (bundle) {
      if (done) return; stop(); busy = false;
      show('Đã tải xong bản <b>v' + m.version + '</b>' + (m.notes ? ' — ' + String(m.notes).replace(/</g, '&lt;') : '') + '.', [
        { t: 'Cập nhật ngay', go: true, f: function () { U.set(bundle); } },
        { t: 'Để lần mở sau', f: function () { U.next(bundle).then(hide); } }]);
      cleanup(bundle);
    }).catch(function (e) { if (!done) fail('Không tải được bản mới: ' + (e && e.message || e)); });
  }

  var busy = false;
  function check(manual) {
    if (busy) return; busy = true;
    Promise.all([
      localVersion(),
      H.get({ url: cfg.manifestUrl + '?_=' + Date.now(), headers: { 'Cache-Control': 'no-cache' }, connectTimeout: 15000, readTimeout: 20000 }),
      A && A.getInfo ? A.getInfo() : Promise.resolve({ build: '0' })
    ]).then(function (r) {
      var cur = r[0] && r[0].version, m = r[1].data, native = parseInt(r[2].build, 10) || 0;
      if (typeof m === 'string') m = JSON.parse(m);
      if (!m || !m.version || !m.url) throw new Error('latest.json không hợp lệ');
      if (cur && cmp(m.version, cur) <= 0) { busy = false; if (manual) show('Bạn đang dùng bản mới nhất (v' + cur + ').', [{ t: 'Đóng', f: hide }]); return; }
      if (m.minNativeVersionCode && native < m.minNativeVersionCode) {         // bản mới cần APK mới
        busy = false;
        show('Có bản <b>v' + m.version + '</b> cần cài lại ứng dụng (APK/AAB mới).', [
          { t: 'Mở trang tải', go: true, f: function () { window.open(cfg.releasesUrl, '_system'); } }, { t: 'Để sau', f: hide }]);
        return;
      }
      return downloadBundle(m, native);
    }).catch(function (e) { busy = false; if (manual) show('Không kiểm tra được cập nhật: ' + (e && e.message || e), [{ t: 'Đóng', f: hide }]); });
  }
  function cleanup(keep) {                                                   // xoá các bản tải về cũ
    U.list().then(function (r) {
      (r.bundles || []).forEach(function (b) { if (b.id !== keep.id && b.status !== 'success') U.delete({ id: b.id }).catch(function () {}); });
    }).catch(function () {});
  }

  window.klCheckUpdate = function () { check(true); };                       // gọi tay: klCheckUpdate()
  setTimeout(function () { check(false); }, 4000);
  setInterval(function () { check(false); }, cfg.checkEveryMs || 21600000);
  if (A && A.addListener) A.addListener('appStateChange', function (s) { if (s && s.isActive) check(false); });
})();
