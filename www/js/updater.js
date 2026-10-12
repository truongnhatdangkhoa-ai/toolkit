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
  localVersion().then(function (v) { if (v) { var t = 'v' + v.version; if (verEl) verEl.textContent = t; var v2 = document.getElementById('ver2'); if (v2) v2.textContent = t; } });

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


  // ---- Tải bản mới: hiện %, tự dừng nếu treo, tự thử lần lượt nhiều địa chỉ, và báo rõ nguyên nhân khi lỗi ----
  var STALL_MS = 30000, TOTAL_MS = 180000;
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function resolveRedirect(url) {                                              // GitHub Releases trả 302 → lấy địa chỉ đích (plugin tải lỗi khi gặp chuyển hướng)
    return H.get({ url: url, disableRedirects: true, headers: { Range: 'bytes=0-0' }, connectTimeout: 15000, readTimeout: 20000 }).then(function (r) {
      var h = r.headers || {}, loc = h.Location || h.location;
      return (r.status >= 300 && r.status < 400 && loc) ? loc : url;
    }).catch(function () { return url; });
  }
  function probe(url) {                                                        // kiểm tra nhanh: máy có với tới file không, có đúng là zip không
    return H.get({ url: url, headers: { Range: 'bytes=0-3' }, responseType: 'blob', connectTimeout: 15000, readTimeout: 20000 }).then(function (r) {
      var d = typeof r.data === 'string' ? r.data : '';
      return 'HTTP ' + r.status + (d.indexOf('UEsD') === 0 ? ' · đúng file zip' : ' · KHÔNG phải file zip');
    }).catch(function (e) { return 'không truy cập được (' + (e && e.message || e) + ')'; });
  }
  function dropStale(keepId) {                                                 // xoá bản tải dở/lỗi trước khi thử lại (tránh tải tiếp trên file hỏng)
    return U.list().then(function (r) {
      return Promise.all((r.bundles || []).map(function (b) {
        if (b.id === keepId || b.status === 'success' || b.id === 'builtin') return null;
        return U.delete({ id: b.id }).catch(function () {});
      }));
    }).catch(function () {});
  }
  function shortUrl(u) { try { return String(u).replace(/^https?:\/\//, '').split('?')[0].slice(0, 70); } catch (e) { return ''; } }

  function downloadBundle(m) {
    var pct = 0, last = Date.now(), t0 = Date.now(), done = false, lis = null, timer = null, rejectNow = null;
    function label(extra) { return 'Đang tải bản <b>v' + esc(m.version) + '</b>… ' + pct + '%' + (extra ? '<br><small>' + extra + '</small>' : ''); }
    show(label());
    function stop() { done = true; clearInterval(timer); if (lis && lis.remove) { try { lis.remove(); } catch (e) {} } }
    function fail(msg, diag) {
      stop(); busy = false;
      try { console.log('[OTA] ' + msg + ' | ' + (diag || '')); } catch (e) {}
      show(esc(msg) + (diag ? '<br><small>' + diag + '</small>' : '') + '<br>Kiểm tra mạng rồi thử lại.', [
        { t: 'Thử lại', go: true, f: function () { check(true); } },
        { t: 'Mở trang tải', f: function () { window.open(cfg.releasesUrl, '_system'); } },
        { t: 'Đóng', f: hide }]);
    }
    try { var l = U.addListener('download', function (ev) {
      if (done || !ev) return; var p = Math.round(ev.percent || 0); if (p !== pct) { pct = p; last = Date.now(); show(label()); }
    }); if (l && l.then) l.then(function (h) { lis = h; if (done && h && h.remove) h.remove(); }); else lis = l; } catch (e) {}
    timer = setInterval(function () {
      if (done || !rejectNow) return;
      if (Date.now() - last > STALL_MS) rejectNow(new Error('Tải bị đứng (không có tiến độ).'));
      else if (Date.now() - t0 > TOTAL_MS) rejectNow(new Error('Tải quá lâu.'));
    }, 2000);

    function once(url) {                                                       // 1 lần tải bằng plugin, có canh treo
      last = Date.now(); t0 = Date.now(); pct = 0;
      return new Promise(function (resolve, reject) {
        rejectNow = reject;
        U.download({ url: url, version: m.version }).then(resolve, reject);
      });
    }
    // Danh sách địa chỉ thử lần lượt: địa chỉ chính (nhánh ota — tải thẳng) → địa chỉ đích sau chuyển hướng → địa chỉ dự phòng (GitHub Releases)
    var seen = {}, urls = [];
    function add(u) { if (u && !seen[u]) { seen[u] = 1; urls.push(u); } }
    add(m.url);
    return resolveRedirect(m.url).then(function (u) { add(u); return m.fallbackUrl ? resolveRedirect(m.fallbackUrl) : null; })
      .then(function (u) { add(m.fallbackUrl); add(u); })
      .then(function () {
        var errs = [];
        function next(i) {
          if (i >= urls.length) return Promise.reject(errs);
          if (i > 0) show(label('Đang thử đường dẫn dự phòng (' + i + '/' + (urls.length - 1) + ')…'));
          return dropStale().then(function () { return once(urls[i]); }).catch(function (e) {
            errs.push((e && e.message || e) + ' @ ' + shortUrl(urls[i])); return next(i + 1);
          });
        }
        return next(0);
      }).then(function (bundle) {
        if (done) return; stop(); busy = false;
        show('Đã tải xong bản <b>v' + esc(m.version) + '</b>' + (m.notes ? ' — ' + esc(m.notes) : '') + '.', [
          { t: 'Cập nhật ngay', go: true, f: function () { U.set(bundle); } },
          { t: 'Để lần mở sau', f: function () { U.next(bundle).then(hide); } }]);
        cleanup(bundle);
      }).catch(function (errs) {
        if (done) return;
        var first = Array.isArray(errs) ? errs[0] : errs;
        probe(m.url).then(function (p) {
          fail('Không tải được bản mới: ' + String(first && first.message || first || 'lỗi không rõ').split(' @ ')[0].replace(/https?:\/\/\S+/g, '').replace(/:\s*$/, ''),
            'Chẩn đoán: ' + esc(p) + ' · đã thử ' + urls.length + ' địa chỉ · v' + esc(m.version));
        });
      });
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
