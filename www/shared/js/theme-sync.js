/* ==========================================================================
   THEME-SYNC — quản lý chuyển đổi giao diện Sáng/Tối cho toàn bộ ứng dụng.
   Mỗi trang (index.html + các module qua iframe) đều nạp file này ở <head>.

   Vì mỗi trang chạy qua giao thức file:// nên trình duyệt coi mỗi trang có
   "origin" riêng biệt (null) — không thể tự chia sẻ localStorage/JS giữa các
   khung iframe khác nhau. Cách đồng bộ dùng ở đây:
   1) Khi 1 trang MỞ LẦN ĐẦU: đọc theme theo thứ tự ưu tiên
        a. Tham số trên URL — vd "?theme=light" (index.html tự thêm khi mở
           module qua iframe, xem showModuleX() trong index.js)
        b. localStorage của CHÍNH trang đó (nếu trước đó đã từng đổi ngay
           trên trang này, ít gặp vì thường đổi từ Cài Đặt)
        c. Mặc định 'dark'
   2) Khi người dùng bấm đổi giao diện (ở màn Cài Đặt): gọi KLA_setTheme() —
      áp ngay cho trang hiện tại, lưu localStorage, rồi postMessage lên
      window.parent (nếu đang trong iframe) để index.html relay tiếp xuống
      TẤT CẢ các iframe module khác đang mở cùng lúc (xem index.js).
   3) Mọi trang đều lắng nghe message "kla-theme-change" để tự áp theme mới
      ngay khi nhận được, dù trang đó không phải nơi bấm nút đổi.
   ========================================================================== */
(function (global) {
  // ---- SỬA LỖI ELECTRON: gõ phím không ăn sau alert()/confirm()/prompt() (09/2026) ----
  // Trên Windows, sau khi hộp thoại gốc đóng, ô nhập (nhất là trong popup) hiện con trỏ nhưng KHÔNG nhận phím
  // một lúc / tới khi bấm ra ngoài cửa sổ rồi bấm lại. Bọc 3 hàm: sau khi hộp thoại đóng, nhờ main.js cho cửa sổ
  // mất rồi lấy lại tiêu điểm (appWindowAPI.refocus), sau đó đặt con trỏ lại đúng ô đang dùng trước đó.
  // Không chạy trong Electron (mở file trực tiếp bằng trình duyệt) thì giữ nguyên hàm gốc.
  (function patchNativeDialogs() {
    try {
      if (global.__klaDialogPatched) return;
      global.__klaDialogPatched = true;
      ['alert', 'confirm', 'prompt'].forEach(function (name) {
        var orig = global[name];
        if (typeof orig !== 'function') return;
        global[name] = function () {
          var active = global.document && global.document.activeElement;
          var result = orig.apply(global, arguments);
          try {
            var api = global.appWindowAPI || (global.parent && global.parent !== global && global.parent.appWindowAPI);
            if (api && typeof api.refocus === 'function') {
              Promise.resolve(api.refocus()).then(function () {
                if (active && active !== global.document.body && active.isConnected && typeof active.focus === 'function') {
                  setTimeout(function () { try { active.focus(); } catch (e) {} }, 0);
                }
              }, function () {});
            }
          } catch (e) {}
          return result;
        };
      });
    } catch (e) {}
  })();

  var STORAGE_KEY = 'kla_theme';

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }

  function getThemeFromUrl() {
    try {
      var params = new URLSearchParams(global.location.search);
      var t = params.get('theme');
      return (t === 'light' || t === 'dark') ? t : null;
    } catch (e) {
      return null;
    }
  }

  function apply(theme) {
    var t = 'light'; // ToolKit Manager: chỉ dùng giao diện Sáng
    document.documentElement.setAttribute('data-theme', t);
    return t;
  }

  // ToolKit Manager: trang module nằm trong khung (iframe) → ẩn khối logo/tên riêng của trang (đã có ở thanh trên của khung)
  try { if (global.top !== global) document.documentElement.classList.add('kl-embedded'); } catch (e) { document.documentElement.classList.add('kl-embedded'); }
  var initialTheme = 'light'; // ToolKit Manager: cố định giao diện Sáng
  apply(initialTheme);
  setStoredTheme(initialTheme);

  global.KLA_getTheme = function () {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  };

  global.KLA_setTheme = function (theme) {
    var t = apply(theme);
    setStoredTheme(t);
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage({ type: 'kla-theme-change', theme: t }, '*');
      }
    } catch (e) {}
  };

  global.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'kla-theme-change') return;
    apply(data.theme);
    setStoredTheme('light');
  });

  // ==========================================================================
  // GHI NHỚ TRANG ĐANG XEM KHI LÀM MỚI (09/2026) — áp cho MỌI module (mọi trang đều nạp file này).
  // Bấm "Làm mới" (↻) trước đây nạp lại module và luôn quay về menu ĐẦU TIÊN. Nay: mỗi lần người dùng bấm 1
  // mục điều hướng (menu bên trái, tab, menu con…) mà mục đó TRỞ THÀNH "đang chọn" (class active / is-active /
  // is-on / selected, hoặc aria-selected / aria-current) → ghi nhớ vào sessionStorage của CHÍNH trang đó (còn nguyên
  // khi làm mới, tự xoá khi tắt app). Nạp lại trang → tự bấm lại đúng các mục đó theo thứ tự (menu cha trước,
  // menu con sau), chờ tối đa 12 giây cho menu vẽ xong (nhiều module vẽ menu sau khi đọc database).
  // Chỉ ghi nhớ mục THỰC SỰ chuyển trạng thái "đang chọn" → nút hành động (Xuất Excel, Lưu…) không bao giờ bị
  // bấm lại. Trang muốn tắt tính năng: đặt window.KLA_NO_NAV_MEMORY = true trước khi nạp file này.
  // ==========================================================================
  (function navMemory() {
    try {
      if (global.KLA_NO_NAV_MEMORY) return;
      if (!global.sessionStorage || !global.document) return;
      var path = String(global.location.pathname || '');
      if (/\/html\/index\.html$/i.test(path)) return; // khung ngoài (Dashboard) có cách nhớ riêng (index.js)
      var KEY = 'kla_nav_' + path;
      var CONTAINER = 'nav, .nav, .sidebar, aside, .tab-nav, .tabs, .tab-bar, .tabbar, .subnav, .sub-nav, .nav-sub, .pl-subnav, [role="tablist"], .menu, .segmented, .seg';
      var ITEM = 'button, a, [role="tab"], .nav-item, .tab-item, .tab, [data-tab], [data-view], [data-page], [data-id], [data-mod], [data-sub], [data-plsub], [data-module]';
      var SKIP_ATTR = /^data-(i|idx|index|count|n|tooltip|title|badge)$/;

      function isActive(el) {
        if (!el) return false;
        var c = el.classList;
        if (c && (c.contains('active') || c.contains('is-active') || c.contains('is-on') || c.contains('selected') || c.contains('current'))) return true;
        var a = el.getAttribute && (el.getAttribute('aria-selected') || el.getAttribute('aria-current'));
        return a === 'true' || a === 'page';
      }
      function containerOf(el) { return el.closest ? el.closest(CONTAINER) : null; }
      function containerKey(c) {
        if (!c) return '';
        if (c.id) return '#' + c.id;
        var cls = (c.className && typeof c.className === 'string') ? c.className.trim().split(/\s+/).filter(function (x) { return !/^(active|is-|open|show|collapsed)/.test(x); }).sort().join('.') : '';
        return c.tagName.toLowerCase() + (cls ? '.' + cls : '');
      }
      function itemKey(el) {
        var parts = [];
        for (var i = 0; i < el.attributes.length; i++) {
          var at = el.attributes[i];
          if (/^data-/.test(at.name) && !SKIP_ATTR.test(at.name) && at.value) parts.push(at.name + '=' + at.value);
        }
        if (el.id) parts.push('#' + el.id);
        if (!parts.length) parts.push('text=' + String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60));
        return parts.sort().join('&');
      }
      function findItem(ck, ik) {
        var cs = document.querySelectorAll(CONTAINER);
        for (var i = 0; i < cs.length; i++) {
          if (containerKey(cs[i]) !== ck) continue;
          var items = cs[i].querySelectorAll(ITEM);
          for (var j = 0; j < items.length; j++) {
            if (containerOf(items[j]) === cs[i] && itemKey(items[j]) === ik) return items[j];
          }
        }
        return null;
      }
      function load() { try { return JSON.parse(global.sessionStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
      function save(list) { try { global.sessionStorage.setItem(KEY, JSON.stringify(list.slice(-4))); } catch (e) {} }

      var replaying = true; // đang tự bấm lại: không ghi nhớ các lần bấm của chính mình
      document.addEventListener('click', function (e) {
        if (replaying || !e.isTrusted) return;
        var t = e.target && e.target.closest ? e.target.closest(ITEM) : null;
        var c = t && containerOf(t);
        if (!t || !c) return;
        var ck = containerKey(c), ik = itemKey(t);
        // Chờ module vẽ lại xong rồi xem mục vừa bấm có thành "đang chọn" không (có module vẽ lại cả menu).
        setTimeout(function () {
          var now = findItem(ck, ik);
          if (!isActive(now) && !isActive(t)) return;
          var list = load().filter(function (x) { return x.c !== ck; });
          list.push({ c: ck, i: ik });
          save(list);
        }, 120);
      }, true);

      function replay() {
        var list = load();
        if (!list.length) { replaying = false; return; }
        var idx = 0, started = Date.now();
        (function step() {
          if (idx >= list.length || Date.now() - started > 12000) { replaying = false; return; }
          var it = list[idx];
          var el = findItem(it.c, it.i);
          if (!el) { setTimeout(step, 250); return; }       // menu chưa vẽ xong → chờ
          if (!isActive(el)) { try { el.click(); } catch (e) {} }
          idx++;
          setTimeout(step, 150);                           // cho menu con kịp vẽ
        })();
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(replay, 200); });
      else setTimeout(replay, 200);
    } catch (e) {}
  })();

  // ==========================================================================
  // GÕ TÌM KIẾM KHÔNG GIẬT / KHÔNG NGẮT QUÃNG (09/2026) — dùng chung cho MỌI trang.
  // 3 nguyên nhân gây giật khi gõ ô tìm kiếm đã gặp:
  //  (1) vẽ lại bảng NGAY mỗi phím (bảng lớn → mỗi phím khựng 50–300 ms, gõ Telex bị ngắt);
  //  (2) vẽ lại CẢ khối có chứa chính ô đang gõ → ô bị tạo mới: con trỏ nhảy về cuối, mất cuộn
  //      ngang của bảng, ký tự gõ trong lúc đang vẽ bị mất;
  //  (3) lọc làm bảng ngắn lại → trang co → thanh cuộn bị kéo lên đột ngột (nhảy màn hình).
  // Công cụ:
  //  KLAType.debounce(fn, ms)  — chờ ngừng gõ ms (mặc định 160) mới chạy fn; đang ghép chữ (IME)
  //                              thì đợi ghép xong. Có .flush() / .cancel().
  //  KLAType.keepFocus(fn)     — chạy fn (vẽ lại) rồi trả lại đúng ô đang gõ + vị trí con trỏ +
  //                              vị trí cuộn (dọc và ngang) của các khung cuộn bao quanh nó.
  //  (tự động) chống co trang   — khi đang gõ trong ô tìm/lọc, khung cuộn ngoài cùng không bị kéo lên
  //                              vì nội dung ngắn lại (thêm khoảng đệm tạm ở cuối, tự bỏ khi cuộn lên).
  // ==========================================================================
  (function typingHelpers() {
    try {
      if (global.KLAType || !global.document) return;
      var doc = global.document;
      var composing = false;
      var afterCompose = [];
      doc.addEventListener('compositionstart', function () { composing = true; }, true);
      doc.addEventListener('compositionend', function () {
        composing = false;
        var list = afterCompose.splice(0);
        setTimeout(function () { list.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }, 0);
      }, true);

      function debounce(fn, ms) {
        var wait = (ms == null) ? 160 : ms;
        var timer = null, lastArgs = null, lastThis = null, queued = false;
        function run() {
          timer = null;
          if (composing) { if (!queued) { queued = true; afterCompose.push(function () { queued = false; run(); }); } return; }
          var a = lastArgs, t = lastThis; lastArgs = lastThis = null;
          fn.apply(t, a || []);
        }
        function d() { lastThis = this; lastArgs = arguments; clearTimeout(timer); timer = setTimeout(run, wait); }
        d.flush = function () { if (timer) { clearTimeout(timer); run(); } };
        d.cancel = function () { clearTimeout(timer); timer = null; lastArgs = lastThis = null; };
        return d;
      }

      var STATE_CLASS = /^(active|is-|has-|focus|open|show|selected|hover)/;
      function cssEsc(s) { return (global.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\#.:\[\]()>+~*^$|=\s]/g, '\\$&'); }
      function selectorOf(el) {
        if (el.id) return '#' + cssEsc(el.id);
        var sel = el.tagName.toLowerCase();
        String(el.className && typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).forEach(function (c) {
          if (c && !STATE_CLASS.test(c)) sel += '.' + cssEsc(c);
        });
        for (var i = 0; i < el.attributes.length; i++) {
          var at = el.attributes[i];
          if (/^data-/.test(at.name) || at.name === 'name') sel += '[' + at.name + '="' + String(at.value).replace(/["\\]/g, '\\$&') + '"]';
        }
        return sel;
      }
      // Đường dẫn ổn định tới 1 phần tử: tổ tiên gần nhất có id + chuỗi nth-child.
      function pathOf(el) {
        var parts = [];
        var node = el;
        while (node && node.nodeType === 1 && node !== doc.documentElement) {
          if (node.id) { parts.unshift('#' + cssEsc(node.id)); return parts.join(' > '); }
          var p = node.parentElement;
          if (!p) break;
          var idx = Array.prototype.indexOf.call(p.children, node) + 1;
          parts.unshift(node.tagName.toLowerCase() + ':nth-child(' + idx + ')');
          node = p;
        }
        return parts.length ? 'html > ' + parts.join(' > ') : null;
      }
      function scrollers(el) {
        var out = [];
        var node = el && el.parentElement;
        while (node && node !== doc.body && node !== doc.documentElement) {
          if (node.scrollTop || node.scrollLeft) out.push(node);
          node = node.parentElement;
        }
        var root = doc.scrollingElement || doc.documentElement;
        if (root.scrollTop || root.scrollLeft) out.push(root);
        return out;
      }

      function keepFocus(fn) {
        var act = doc.activeElement;
        var isField = act && act !== doc.body && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA');
        var info = null;
        if (isField) {
          var sel = selectorOf(act);
          var all = []; try { all = Array.prototype.slice.call(doc.querySelectorAll(sel)); } catch (e) {}
          var ss = null, se = null; try { ss = act.selectionStart; se = act.selectionEnd; } catch (e) {}
          info = {
            el: act, sel: sel, idx: Math.max(0, all.indexOf(act)), value: act.value, ss: ss, se: se,
            scroll: scrollers(act).map(function (s) {
              return { el: s, path: (s === doc.scrollingElement || s === doc.documentElement) ? null : pathOf(s), top: s.scrollTop, left: s.scrollLeft };
            })
          };
        }
        var result = fn();
        if (!info) return result;
        var restore = function () {
          try {
            // Giữ chiều cao khung cuộn ngoài cùng TRƯỚC (nội dung ngắn lại thì vị trí cuộn cũ không còn đặt được).
            if (holdScroll) holdScroll();
            var target = info.el.isConnected ? info.el : null;
            if (!target) {
              var list = []; try { list = doc.querySelectorAll(info.sel); } catch (e) {}
              target = list[info.idx] || list[0] || null;
            }
            if (!target) return;
            // Ô cũ luôn có giá trị MỚI NHẤT (kể cả ký tự gõ trong lúc đang vẽ) — không để mất chữ.
            if (target !== info.el && target.value !== info.value) target.value = info.value;
            if (doc.activeElement !== target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
            if (info.ss != null) { try { target.setSelectionRange(info.ss, info.se); } catch (e) {} }
            // Trả vị trí cuộn SAU CÙNG (focus/đặt con trỏ có thể tự cuộn khung bảng).
            info.scroll.forEach(function (s) {
              var t = s.el.isConnected ? s.el : (s.path ? doc.querySelector(s.path) : null);
              if (!t) return;
              if (t.scrollTop !== s.top) t.scrollTop = s.top;
              if (t.scrollLeft !== s.left) t.scrollLeft = s.left;
            });
          } catch (e) { console.error('[KLAType.keepFocus]', e); }
        };
        if (result && typeof result.then === 'function') { return result.then(function (r) { restore(); return r; }); }
        restore();
        return result;
      }

      var holdScroll = null; // gán ở phần "chống co trang" bên dưới
      global.KLAType = { debounce: debounce, keepFocus: keepFocus };

      // ---- Tự động: chống co trang / nhảy cuộn khi đang gõ ô tìm kiếm ----
      function isSearchField(el) {
        if (!el || el.tagName !== 'INPUT' || el.readOnly || el.disabled) return false;
        var type = String(el.type || 'text').toLowerCase();
        if (type !== 'text' && type !== 'search') return false;
        if (type === 'search') return true;
        var hay = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.name || '');
        if (/search|filter|tim|loc/i.test(hay)) return true;
        return /^(tìm|tim|lọc|loc|search)/i.test(String(el.placeholder || '').trim());
      }
      function outerScroller(el) {
        var found = null, node = el.parentElement;
        while (node && node !== doc.body && node !== doc.documentElement) {
          var oy = global.getComputedStyle(node).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && node.clientHeight > 0) found = node;
          node = node.parentElement;
        }
        return found || doc.scrollingElement || doc.documentElement;
      }
      var cur = null; // { root, host, spacer, saved, mo, typing }
      function spacerH() { return cur && cur.spacer && cur.spacer.isConnected ? cur.spacer.offsetHeight : 0; }
      function ensureSpacer() {
        if (cur.spacer && cur.spacer.isConnected && cur.spacer.parentNode === cur.host && cur.host.lastElementChild === cur.spacer) return;
        if (!cur.spacer) {
          cur.spacer = doc.createElement('div');
          cur.spacer.className = 'kla-typing-spacer';
          cur.spacer.setAttribute('aria-hidden', 'true');
          cur.spacer.style.cssText = 'display:block;height:0;margin:0;padding:0;border:0;flex:none;grid-column:1/-1;pointer-events:none;visibility:hidden;';
        }
        cur.host.appendChild(cur.spacer);
      }
      // Chiều cao nội dung THẬT (không tính khoảng đệm) = vị trí đỉnh khoảng đệm trong khung cuộn.
      // Không dùng scrollHeight: khi nội dung ngắn hơn khung, scrollHeight trả về chiều cao KHUNG.
      function contentHeight() {
        var r = cur.root, isDoc = (r === doc.scrollingElement || r === doc.documentElement);
        var spTop = cur.spacer.getBoundingClientRect().top;
        var base = isDoc ? -global.scrollY : r.getBoundingClientRect().top + (r.clientTop || 0) - r.scrollTop;
        var pb = parseFloat(global.getComputedStyle(cur.host).paddingBottom) || 0;
        return spTop - base + pb;
      }
      function fit(keepTop) {
        if (!cur) return;
        var r = cur.root;
        var clamped = keepTop && cur.saved > r.scrollTop && (r.scrollTop + r.clientHeight >= r.scrollHeight - 2);
        var top = clamped ? cur.saved : r.scrollTop;
        ensureSpacer();
        var need = top > 0 ? Math.max(0, Math.ceil(top + r.clientHeight - contentHeight())) : 0; // ở đầu trang: không cần đệm
        if (need > 0 || cur.typing) {
          if (cur.spacer.offsetHeight !== need) cur.spacer.style.height = need + 'px';
        } else if (cur.spacer.parentNode) {
          cur.spacer.parentNode.removeChild(cur.spacer);
        }
        if (clamped && r.scrollTop !== cur.saved) r.scrollTop = cur.saved;
        cur.saved = r.scrollTop;
        if (cur.mo) cur.mo.takeRecords(); // bỏ qua thay đổi DOM do chính hàm này gây ra (không tự gọi lại vô hạn)
      }
      holdScroll = function () { if (cur && cur.typing) fit(true); };
      function onScroll() {
        if (!cur) return;
        if (cur.typing) { cur.saved = cur.root.scrollTop; return; }
        fit(false); // đã rời ô tìm kiếm: người dùng cuộn lên thì bớt dần khoảng đệm, hết thì bỏ hẳn
        if (!spacerH()) teardown();
      }
      function teardown() {
        if (!cur) return;
        try { if (cur.mo) cur.mo.disconnect(); } catch (e) {}
        (cur.root === doc.scrollingElement || cur.root === doc.documentElement ? global : cur.root).removeEventListener('scroll', onScroll);
        if (cur.spacer && cur.spacer.parentNode) cur.spacer.parentNode.removeChild(cur.spacer);
        cur = null;
      }
      doc.addEventListener('focusin', function (e) {
        var el = e.target;
        if (!isSearchField(el)) return;
        var root = outerScroller(el);
        if (cur && cur.root !== root) teardown();
        if (!cur) {
          var isDoc = (root === doc.scrollingElement || root === doc.documentElement);
          cur = { root: root, host: isDoc ? doc.body : root, spacer: null, saved: root.scrollTop, mo: null, typing: true };
          cur.mo = new MutationObserver(function () { if (cur && cur.typing) fit(true); });
          cur.mo.observe(cur.host, { childList: true, subtree: true });
          (isDoc ? global : root).addEventListener('scroll', onScroll, { passive: true });
        }
        // Ô vừa được vẽ lại (keepFocus) nhận lại tiêu điểm: KHÔNG ghi đè vị trí cuộn đã nhớ (có thể vừa bị kéo lên).
        if (!cur.typing) cur.saved = root.scrollTop;
        cur.typing = true;
      }, true);
      doc.addEventListener('focusout', function (e) {
        if (!cur || !isSearchField(e.target)) return;
        setTimeout(function () {
          if (!cur) return;
          if (isSearchField(doc.activeElement) && outerScroller(doc.activeElement) === cur.root) return;
          cur.typing = false;
          try { if (cur.mo) cur.mo.disconnect(); cur.mo = null; } catch (err) {}
          fit(false);
          if (!spacerH()) teardown();
        }, 0);
      }, true);
    } catch (e) { console.error('[KLAType]', e); }
  })();
  // ---- CỘT SỐ CÓ MÀU — giao diện Sáng mẫu E (PC 2.8) ----
  // Dò tiêu đề cột của mọi bảng: Tồn đầu (dau) · Nhập (nhap) · Xuất (xuat) · Tồn cuối (cuoi) → gắn th[data-tint];
  // css/theme-sang-e.css tô màu tiêu đề. Thân bảng: 1 quy tắc nth-child cho cả cột (không đụng từng ô) — chỉ khi các
  // cột đứng trước không gộp ô (colspan), để số thứ tự cột khớp. CSS chỉ có tác dụng ở giao diện Sáng.
  // Nhận diện theo CẢ TIÊU ĐỀ (không lấy "Ngày nhập", "Xuất xứ", "Phiếu xuất"…).
  (function colTint() {
    try {
      var doc = global.document;
      if (!doc || !global.MutationObserver) return;
      var KINDS = [
        ['dau', /^ton (dau|dau ky|cuoi ky truoc|truoc)( \(.*\))?$/],
        ['nhap', /^(sl |kl |so luong )?nhap( trong ky| kho)?( \(.*\))?$/],
        ['xuat', /^(sl |kl |so luong )?xuat( trong ky| kho)?( \(.*\))?$/],
        ['cuoi', /^(tong )?ton (cuoi|ck)( ky)?( \(.*\))?$/]
      ];
      function fold(t) {
        return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
          .toLowerCase().replace(/[^a-z0-9() ]+/g, ' ').replace(/\s+/g, ' ').trim();
      }
      function kindOf(th) {
        var f = fold(th.textContent);
        for (var i = 0; i < KINDS.length; i++) if (KINDS[i][1].test(f)) return KINDS[i][0];
        return '';
      }
      var style = null, seq = 0, lastCss = '';
      function scan() {
        var rules = [];
        var tables = doc.getElementsByTagName('table');
        for (var t = 0; t < tables.length; t++) {
          var tb = tables[t], head = tb.tHead;
          if (!head || !head.rows.length) continue;
          var cells = head.rows[0].cells, pos = 0, aligned = true, any = false;
          for (var c = 0; c < cells.length; c++) {
            var th = cells[c], k = kindOf(th);
            if ((th.getAttribute('data-tint') || '') !== k) { if (k) th.setAttribute('data-tint', k); else th.removeAttribute('data-tint'); }
            if (k && aligned && th.colSpan === 1) {
              if (!tb.getAttribute('data-tint-id')) tb.setAttribute('data-tint-id', String(++seq));
              rules.push('html[data-theme="light"] table[data-tint-id="' + tb.getAttribute('data-tint-id') + '"]>tbody>tr>td:nth-child(' + (pos + 1) + '){box-shadow:inset 0 0 0 9999px var(--tint-' + k + '-b)}');
              any = true;
            }
            if (th.colSpan > 1) aligned = false;
            pos += th.colSpan || 1;
          }
          if (!any && tb.getAttribute('data-tint-id')) tb.removeAttribute('data-tint-id');
        }
        var css = rules.join('\n');
        if (css === lastCss) return;
        lastCss = css;
        if (!style) { style = doc.createElement('style'); style.id = 'kla-col-tint'; (doc.head || doc.documentElement).appendChild(style); }
        style.textContent = css;
      }
      var timer = null;
      function later() { if (timer) return; timer = setTimeout(function () { timer = null; scan(); }, 300); }
      function start() {
        scan();
        new MutationObserver(function (list) {
          for (var i = 0; i < list.length; i++) {
            var n = list[i].target;
            // chỉ quét lại khi phần TIÊU ĐỀ bảng / bảng mới thay đổi (bỏ qua vẽ lại thân bảng lớn)
            if (n.nodeName === 'TBODY' || (n.closest && n.closest('tbody'))) continue;
            later(); return;
          }
        }).observe(doc.body, { childList: true, subtree: true });
      }
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
    } catch (e) { console.error('[KLAColTint]', e); }
  })();
  // PC 7.61 — LỊCH SỬ THAO TÁC: ghi nhận khi người dùng CHỌN FILE để nhập (mọi module dùng chung file này).
  // Có 2 loại ô chọn file: (1) <input type=file> có sẵn trong trang → bắt 'change' ở document; (2) ô tạo bằng createElement rồi .click()
  // (không nằm trong trang nên 'change' không nổi bọt lên document) → bọc HTMLInputElement.prototype.click để gắn bộ nghe riêng.
  // Chỉ gửi TÊN + DUNG LƯỢNG file (không có đường dẫn / nội dung). Cờ __klaH trên sự kiện chống ghi 2 lần.
  (function histImport() {
    try {
      if (!global.historyAPI || typeof global.historyAPI.logImport !== 'function') return;
      function report(e) {
        var t = e && e.target;
        if (!t || t.tagName !== 'INPUT' || t.type !== 'file' || e.__klaH) return;
        e.__klaH = true;
        var fl = t.files; if (!fl || !fl.length) return;
        var arr = [];
        for (var i = 0; i < fl.length && i < 5; i++) arr.push({ name: fl[i].name, size: fl[i].size });
        try { var p = global.historyAPI.logImport(arr); if (p && p.catch) p.catch(function () {}); } catch (er) { /* bỏ qua */ }
      }
      document.addEventListener('change', report, true);
      var origClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        try { if (this.type === 'file' && !this.__klaHist) { this.__klaHist = 1; this.addEventListener('change', report); } } catch (e) { /* bỏ qua */ }
        return origClick.apply(this, arguments);
      };
    } catch (e) { console.error('[KLAHistImport]', e); }
  })();
})(window);
