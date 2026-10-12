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


  // ---------- Tải bản mới: thử lần lượt NHIỀU địa chỉ, hiện % và báo rõ nguyên nhân khi lỗi ----------
  // 1) địa chỉ trực tiếp trên nhánh "ota" (raw.githubusercontent.com — KHÔNG chuyển hướng)
  // 2) bản phát hành GitHub: lấy địa chỉ đích sau khi chuyển hướng (302) rồi mới tải
  // 3) bản phát hành GitHub: địa chỉ gốc
  function resolveRedirect(url) {
    return H.get({ url: url, headers: { Range: 'bytes=0-0' }, disableRedirects: true, connectTimeout: 15000, readTimeout: 20000 }).then(function (r) {
      var h = r.headers || {}, loc = h.Location || h.location;
      return (r.status >= 300 && r.status < 400 && loc) ? loc : url;
    }).catch(function () { return url; });
  }
  function hostOf(u) { var m = /^https?:\/\/([^\/]+)/.exec(String(u)); return m ? m[1] : String(u).slice(0, 40); }
  function errText(e) {
    if (!e) return 'lỗi không rõ';
    var t = e.message || e.error || (typeof e === 'string' ? e : '');
    if (!t) { try { t = JSON.stringify(e); } catch (x) { t = String(e); } }
    if (e.code) t += ' [' + e.code + ']';
    return String(t).replace(/Failed to download from: \S+/, 'Plugin tải lỗi').slice(0, 160);
  }
  function probe(url) {                                                      // kiểm tra mạng có tải được địa chỉ đó không (độc lập với plugin)
    return H.get({ url: url, headers: { Range: 'bytes=0-0' }, connectTimeout: 15000, readTimeout: 20000, responseType: 'arraybuffer' })
      .then(function (r) { return 'mạng OK (HTTP ' + r.status + ')'; })
      .catch(function (e) { return 'mạng lỗi: ' + errText(e); });
  }
  function purge(version) {                                                  // xoá bản tải dở của chính phiên bản này (tránh kẹt từ lần lỗi trước)
    return U.list().then(function (r) {
      return Promise.all((r.bundles || []).filter(function (b) { return b.version === version && b.status !== 'success'; })
        .map(function (b) { return U.delete({ id: b.id }).catch(function () {}); }));
    }).catch(function () {});
  }
  var STALL_MS = 40000, TOTAL_MS = 240000;
  function downloadBundle(m) {
    var st = { pct: 0, last: Date.now() }, lis = null, urls = [], errs = [];
    (m.mirrors || []).forEach(function (u) { if (u && urls.indexOf(u) < 0) urls.push(u); });
    if (urls.indexOf(m.url) < 0) urls.push(m.url);
    function label(extra) { return 'Đang tải bản <b>v' + m.version + '</b>… ' + st.pct + '%' + (extra ? ' <small>' + extra + '</small>' : ''); }
    show(label());
    try {
      var l = U.addListener('download', function (ev) {
        if (!ev) return; var p = Math.round(ev.percent || 0); st.last = Date.now(); if (p !== st.pct) { st.pct = p; show(label()); }
      });
      if (l && l.then) l.then(function (h) { lis = h; }); else lis = l;
    } catch (e) {}
    function unlisten() { if (lis && lis.remove) { try { lis.remove(); } catch (e) {} } }

    function one(url) {                                                      // 1 lần tải, có canh treo
      return new Promise(function (resolve, reject) {
        var t0 = Date.now(), fin = false; st.last = Date.now();
        var tm = setInterval(function () {
          if (fin) return;
          if (Date.now() - st.last > STALL_MS) end(new Error('đứng, không có tiến độ'));
          else if (Date.now() - t0 > TOTAL_MS) end(new Error('quá lâu'));
        }, 2000);
        function end(err, val) { if (fin) return; fin = true; clearInterval(tm); err ? reject(err) : resolve(val); }
        U.download({ url: url, version: m.version }).then(function (b) { end(null, b); }, function (e) { end(e); });
      });
    }
    function attempt(i) {                                                    // thử địa chỉ thứ i; hết địa chỉ → báo lỗi
      if (i >= urls.length) return Promise.reject(new Error('hết địa chỉ để thử'));
      var u = urls[i];
      return purge(m.version).then(function () {
        return /github\.com\//.test(u) ? resolveRedirect(u) : u;
      }).then(function (finalUrl) {
        st.pct = 0; show(label(hostOf(finalUrl)));
        return one(finalUrl).catch(function (e1) {
          errs.push(hostOf(finalUrl) + ': ' + errText(e1));
          if (finalUrl === u) throw e1;
          return purge(m.version).then(function () { return one(u); });     // thử lại bằng địa chỉ gốc
        });
      }).catch(function (e) {
        if (!errs.length || errs[errs.length - 1].indexOf(errText(e)) < 0) errs.push(hostOf(u) + ': ' + errText(e));
        return attempt(i + 1);
      });
    }
    function fail() {
      unlisten(); busy = false;
      probe(urls[0]).then(function (pr) {
        var det = errs.slice(-3).map(function (x) { return x.replace(/</g, '&lt;'); }).join('<br>');
        show('Không tải được bản mới <b>v' + m.version + '</b>.<br><small>' + det + '<br>' + hostOf(urls[0]) + ' → ' + pr + '</small>' +
          '<br><small>Nếu lỗi lặp lại: bấm “Mở trang tải” và cài APK mới nhất (APK luôn chứa bản mới).</small>', [
          { t: 'Thử lại', go: true, f: function () { check(true); } },
          { t: 'Mở trang tải', f: function () { window.open(cfg.releasesUrl, '_system'); } },
          { t: 'Đóng', f: hide }]);
      });
    }
    return attempt(0).then(function (bundle) {
      unlisten(); busy = false;
      show('Đã tải xong bản <b>v' + m.version + '</b>' + (m.notes ? ' — ' + String(m.notes).replace(/</g, '&lt;') : '') + '.', [
        { t: 'Cập nhật ngay', go: true, f: function () { U.set(bundle); } },
        { t: 'Để lần mở sau', f: function () { U.next(bundle).then(hide); } }]);
      cleanup(bundle);
    }, fail);
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
