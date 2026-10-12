// tip-nhanh.js — chú thích HIỆN NGAY khi rê chuột vào nút chỉ có biểu tượng (PC 0.29). Không chờ như title mặc định của trình duyệt.
// Phần tử nào có data-tip="Tên chức năng" (và tùy chọn data-tip-desc / title làm dòng giải thích) sẽ hiện chú thích ngay; nút .c3d-btn không có data-tip lấy chữ của nút.
// Dùng chung được cho trang khác: nạp file này + thêm CSS `.kl-tip` (css/c3d-redesign.css cuối file).
(function () {
  'use strict';
  var tip = null, cur = null;
  function el() {
    if (tip) return tip;
    tip = document.createElement('div'); tip.className = 'kl-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    document.body.appendChild(tip); return tip;
  }
  function textOf(t) {
    var name = t.getAttribute('data-tip'), desc = t.getAttribute('data-tip-desc'), ti = t.getAttribute('title') || '';
    if (!name && t.closest('.c3d-grp') && t.classList.contains('c3d-btn')) name = (t.textContent || '').replace(/\s+/g, ' ').trim();
    if (!name) name = ti; // phần tử chỉ có title: hiện luôn title, không chờ
    if (!name) return null;
    if (ti) { t.removeAttribute('title'); if (!desc && ti !== name) { desc = ti; t.setAttribute('data-tip-desc', ti); } } // bỏ title để khỏi hiện 2 lần
    return { name: name, desc: (desc && desc !== name) ? desc : '' };
  }
  function place(t) {
    var d = el(), r = t.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight, vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var x = r.left + r.width / 2 - w / 2; x = Math.max(6, Math.min(x, vw - w - 6));
    var y = r.bottom + 8; if (y + h > vh - 6) y = Math.max(6, r.top - h - 8);
    d.style.left = Math.round(x) + 'px'; d.style.top = Math.round(y) + 'px';
  }
  function show(t) {
    var c = textOf(t); if (!c) return;
    var d = el(); cur = t;
    d.innerHTML = ''; var b = document.createElement('b'); b.textContent = c.name; d.appendChild(b);
    if (c.desc) { var s = document.createElement('span'); s.textContent = c.desc; d.appendChild(s); }
    d.hidden = false; place(t);
  }
  function hide() { cur = null; if (tip) tip.hidden = true; }
  function find(n) { return n && n.closest ? n.closest('[data-tip],[title],.c3d-btn') : null; }
  document.addEventListener('mouseover', function (e) { var t = find(e.target); if (t && t !== cur) show(t); else if (!t) hide(); });
  document.addEventListener('mouseout', function (e) { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  document.addEventListener('focusin', function (e) { var t = find(e.target); if (t && e.target.matches && e.target.matches(':focus-visible')) show(t); });
  document.addEventListener('focusout', hide);
  ['mousedown', 'wheel', 'scroll', 'keydown', 'blur'].forEach(function (ev) { window.addEventListener(ev, hide, true); });
})();
