/* MODULE "CONTAINER LOADING 3D" — GIAO DIỆN + LƯU TRỮ (PC 8.57).
   Lõi tính toán: C3DEngine (c3d-engine.js) · Dựng 3D: C3DView (c3d-view.js).
   Database: dbKey 'module14' = module14_container3d.xlsx
     C3D_Container — container người dùng đã sửa / thêm (mẫu có sẵn nằm trong code; sửa mẫu = ghi 1 dòng "ghi đè", Xóa = về mẫu gốc)
     C3D_Plan      — phương án đã lưu (container + danh sách hàng + tuỳ chọn; kết quả TÍNH LẠI khi mở, không lưu toạ độ từng thùng)
     C3D_State     — trạng thái làm việc lần trước (tự lưu) */
(function () {
  'use strict';
  const E = window.C3DEngine, DB = 'module14', SH_C = 'C3D_Container', SH_P = 'C3D_Plan', SH_S = 'C3D_State', SH_T = 'C3D_Thung'; // C3D_Thung = DANH MỤC loại thùng (kích thước, kg, cách xếp) dùng lại cho các cont sau
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = E.num, clone = (o) => JSON.parse(JSON.stringify(o));
  const fmt = (n, d) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); // nghìn "," · thập phân "."
  const fmtKg = (n) => fmt(n, 2) + ' kg';
  const fmtM = (mm) => fmt(mm / 1000, 2) + ' m';
  const m3 = (mm3, d) => fmt(mm3 / 1e9, d == null ? 2 : d); // mm³ → m³
  const PAL = ['#3b82f6', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#eab308', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6', '#f43f5e', '#8b5cf6'];
  const TYPES = [['20RF', "20' RF"], ['40RF', "40' RF"], ['40HC', "40' HC RF"], ['20DC', "20' DC (khô)"], ['40DC', "40' DC (khô)"], ['40HCDC', "40' HC DC (khô)"], ['KHAC', 'Khác']];
  const CKEYS = ['L', 'W', 'H', 'doorW', 'doorH', 'redLine', 'clearFront', 'clearRear', 'clearSide'];

  let bootOk; const booted = new Promise((r) => { bootOk = r; });
  const S = {
    cat: [], unit: 'mm', saved: [], cid: 'rf40hc', cont: null, skus: [], colors: {}, opts: { mergeTail: true, stackTop: true, heightRule: true, sampleOn: true, sampleQty: 10, dateDir: 'asc', sortMode: 'auto' },
    plan: null, plans: [], user: { canWrite: true, canExport: true, ten: '' }, view: null, hidden: { tiers: new Set(), groups: new Set(), rows: new Set() }, selRow: null, seqMax: null, playing: 0,
    calcT: 0, saveT: 0, loaded: false, autoMiss: {}, openedAuto: '', selBox: null, layerOpen: true,
  };
  const f = () => (S.unit === 'cm' ? 10 : 1);
  const toU = (mm) => { const v = mm / f(); return String(Math.round(v * 100) / 100); };
  const fromU = (s) => num(s) * f();
  let toastT = 0;
  function toast(t) { const e = $('c3dToast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; }, 3800); }

  // ------------------------------------------------------------------ lưu / nạp
  async function readSheet(name) { try { const r = await window.dbAPI.readSheet(DB, name); return r && r.ok && Array.isArray(r.data) ? r.data : []; } catch (e) { return []; } }
  const unpack = (x) => { try { return JSON.parse(String(x && x.data || '').replace(/^__JSON__/, '')); } catch (e) { return null; } };
  async function writeSheet(name, rows) {
    const r = await window.dbAPI.writeSheets(DB, { [name]: rows }); if (!r || r.ok === false) throw new Error((r && r.error) || 'Không lưu được'); return true;
  }
  async function loadAll() {
    const [c, p, s, th] = await Promise.all([readSheet(SH_C), readSheet(SH_P), readSheet(SH_S), readSheet(SH_T)]);
    S.cat = th.map((x) => { const v = unpack(x); return v ? { id: String(x.id), name: String(x.name || ''), capNhat: String(x.capNhat || ''), v } : null; }).filter(Boolean);
    S.saved = c.map((x) => { const v = unpack(x); return v ? { id: String(x.id || v.id || ''), v } : null; }).filter((x) => x && x.id);
    S.plans = p.map((x) => { const d = unpack(x); return d ? { id: String(x.id), name: String(x.name || ''), capNhat: String(x.capNhat || ''), contName: String(x.contName || ''), loaded: +x.loaded || 0, requested: +x.requested || 0, data: d } : null; }).filter(Boolean).sort((a, b) => b.capNhat.localeCompare(a.capNhat));
    const st = s.length ? unpack(s[0]) : null;
    if (st) {
      if (st.unit) S.unit = st.unit; if (st.cid) S.cid = st.cid; if (st.cont) S.cont = st.cont; if (Array.isArray(st.skus)) S.skus = st.skus; if (st.colors) S.colors = st.colors; if (st.opts) S.opts = Object.assign(S.opts, st.opts); if (st.autoMiss && typeof st.autoMiss === 'object') S.autoMiss = st.autoMiss;
    }
  }
  function scheduleSave() {
    if (!S.user.canWrite || !S.loaded) return; clearTimeout(S.saveT);
    S.saveT = setTimeout(() => { writeSheet(SH_S, [{ id: 'state', capNhat: new Date().toISOString(), data: '__JSON__' + JSON.stringify({ unit: S.unit, cid: S.cid, cont: S.cont, skus: S.skus, colors: S.colors, opts: S.opts, autoMiss: S.autoMiss }) }]).catch(() => { /* tự lưu: bỏ qua lỗi */ }); }, 900);
  }
  async function persistContainers() {
    const rows = S.saved.map((c) => ({ id: c.id, name: c.v.name || '', builtin: E.PRESETS.some((p) => p.id === c.id) ? '1' : '', data: '__JSON__' + JSON.stringify(c.v) }));
    await writeSheet(SH_C, rows);
  }

  // ------------------------------------------------------------------ container
  function contList() {
    const ov = {}; S.saved.forEach((c) => { ov[c.id] = c.v; });
    const out = E.PRESETS.map((p) => Object.assign({}, p, ov[p.id] || {}, { id: p.id, builtin: true, edited: !!ov[p.id] }));
    S.saved.filter((c) => !E.PRESETS.some((p) => p.id === c.id)).forEach((c) => out.push(Object.assign({}, c.v, { id: c.id, builtin: false })));
    return out;
  }
  function pickContainer(id) {
    const c = contList().find((x) => x.id === id) || contList()[2]; S.cid = c.id; S.cont = clone(c); delete S.cont.builtin; delete S.cont.edited;
  }
  const contView = () => { const c = S.cont, cur = contList().find((x) => x.id === S.cid); return { c, cur }; };

  // ------------------------------------------------------------------ mặt hàng
  let skuSeq = 0;
  const newSku = (o) => Object.assign({ id: 's' + Date.now().toString(36) + (skuSeq++), code: '', name: '', size: '', date: '', qty: 100, L: 520, W: 280, H: 190, kg: 10, allowRotate: true, allowStand: true, allowLay: false, sole: false, maxLayers: 0, note: '' }, o || {});
  function colorFor(code) {
    const k = String(code || '').trim() || '(trống)'; if (S.colors[k]) return S.colors[k];
    const used = new Set(Object.values(S.colors)), free = PAL.find((c) => !used.has(c)); S.colors[k] = free || PAL[Object.keys(S.colors).length % PAL.length]; return S.colors[k];
  }
  function shade(hex, d) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
    l = Math.min(0.82, Math.max(0.22, l + d));
    const q = (p, qq, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (qq - p) * 6 * t; if (t < 1 / 2) return qq; if (t < 2 / 3) return p + (qq - p) * (2 / 3 - t) * 6; return p; };
    let R, G, B; if (s === 0) R = G = B = l; else { const qq = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - qq; R = q(p, qq, h + 1 / 3); G = q(p, qq, h); B = q(p, qq, h - 1 / 3); }
    const x = (v) => ('0' + Math.round(v * 255).toString(16)).slice(-2); return '#' + x(R) + x(G) + x(B);
  }
  function groupColors(plan) {
    const seen = {}, VAR = [0, 0.1, -0.1, 0.18, -0.16];
    return plan.groups.map((g) => { const k = String(g.sku.code || '').trim() || '(trống)'; seen[k] = (seen[k] || 0); const v = VAR[seen[k] % VAR.length]; seen[k]++; return shade(colorFor(k), v); });
  }

  // ------------------------------------------------------------------ vẽ cột trái
  const fld = (label, attrs, val, cls) => '<label class="c3d-f ' + (cls || '') + '"><span>' + label + '</span><input type="text" inputmode="decimal" autocomplete="off" ' + attrs + ' value="' + esc(val) + '"></label>';
  function renderSide() {
    const c = S.cont, lst = contList(), u = S.unit;
    const opt = (id, t) => '<option value="' + esc(id) + '"' + (id === S.cid ? ' selected' : '') + '>' + esc(t) + '</option>';
    const cont = '<div class="c3d-card"><h3>1. Container lạnh <small>sửa theo cont thực tế</small></h3>' +
      '<div class="c3d-row"><label class="c3d-f" style="flex:2 1 220px"><span>Chọn container</span><select id="cSel">' + lst.map((x) => opt(x.id, (x.builtin ? '' : '★ ') + x.name + (x.edited ? ' (đã sửa)' : '') + ' — ' + m3(x.L * x.W * x.H, 1) + ' m³')).join('') + '</select></label>' +
      '<label class="c3d-f" style="flex:0 0 96px"><span>Đơn vị dài</span><select id="cUnit"><option value="mm"' + (u === 'mm' ? ' selected' : '') + '>mm</option><option value="cm"' + (u === 'cm' ? ' selected' : '') + '>cm</option></select></label></div>' +
      '<div class="c3d-grid g2"><label class="c3d-f"><span>Tên container</span><input type="text" data-c="name" value="' + esc(c.name) + '"></label>' +
      '<label class="c3d-f"><span>Loại</span><select data-c="type">' + TYPES.map((t) => '<option value="' + t[0] + '"' + (c.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select></label></div>' +
      '<div class="c3d-grid" style="margin-top:7px">' +
      fld('Dài trong <span class="u">(' + u + ')</span>', 'data-c="L"', toU(c.L)) + fld('Rộng trong <span class="u">(' + u + ')</span>', 'data-c="W"', toU(c.W)) + fld('Cao trong <span class="u">(' + u + ')</span>', 'data-c="H"', toU(c.H)) +
      fld('Rộng cửa <span class="u">(' + u + ')</span>', 'data-c="doorW"', toU(c.doorW)) + fld('Cao cửa <span class="u">(' + u + ')</span>', 'data-c="doorH"', toU(c.doorH)) + fld('Tải trọng cho phép <span class="u">(kg)</span>', 'data-c="maxPayload"', String(c.maxPayload || '')) +
      fld('Red line — cao tối đa xếp <span class="c3d-q" tabindex="0">?<span class="c3d-qb">Vạch đỏ trên vách cont lạnh: hàng KHÔNG được cao quá vạch này để khí lạnh lưu thông phía trên. Thông số mẫu chỉ tham khảo — nhập theo cont thực tế.</span></span> <span class="u">(' + u + ')</span>', 'data-c="redLine"', toU(c.redLine), 'span3') +
      fld('Khe vách đầu <span class="c3d-q" tabindex="0">?<span class="c3d-qb">Khe vách đầu (có cửa gió lạnh) / khe cửa / hai bên: để trống khoảng này khi xếp.</span></span> <span class="u">(' + u + ')</span>', 'data-c="clearFront"', toU(c.clearFront)) + fld('Khe cửa <span class="u">(' + u + ')</span>', 'data-c="clearRear"', toU(c.clearRear)) + fld('Khe hai bên <span class="u">(' + u + ')</span>', 'data-c="clearSide"', toU(c.clearSide)) +
      '</div><div class="c3d-ro" id="cRo"></div>' +
      '<div class="c3d-btns"><button type="button" class="c3d-btn sm" data-act="cSave">Lưu thay đổi cont này</button><button type="button" class="c3d-btn sm" data-act="cSaveNew">Lưu thành cont mới</button><button type="button" class="c3d-btn sm danger" data-act="cDel">' + (lst.find((x) => x.id === S.cid) && lst.find((x) => x.id === S.cid).builtin ? 'Khôi phục mẫu gốc' : 'Xóa cont này') + '</button></div></div>';
    const skus = '<div class="c3d-card"><h3>2. Hàng hóa đóng vào 1 cont <small>SL = tổng số thùng cần đóng</small></h3>' +
      '<div class="c3d-btns" style="margin:0 0 9px"><button type="button" class="c3d-btn sm pri" data-act="sAdd">+ Thêm mặt hàng</button><button type="button" class="c3d-btn sm" data-act="sCat" title="Lấy loại thùng đã lưu (kích thước, kg, cách xếp) — chỉ nhập lại số lượng">Từ danh mục thùng</button><button type="button" class="c3d-btn sm" data-act="sPaste">Dán từ Excel</button><button type="button" class="c3d-btn sm" data-act="sDemo">Ví dụ mẫu</button><button type="button" class="c3d-btn sm danger" data-act="sClear">Xóa hết</button></div>' +
      '<div id="skuList">' + (S.skus.length ? S.skus.map(skuCard).join('') : '<div class="c3d-empty-l">Chưa có mặt hàng. Bấm “+ Thêm mặt hàng”, “Dán từ Excel” hoặc “Ví dụ mẫu”.</div>') + '</div>' +
      '<p class="c3d-note">Hệ thống tự sắp thứ tự đóng: <b>mặt hàng → size → ngày</b>; nhóm đầu vào SÂU NHẤT (sát vách đầu), nhóm cuối sát cửa. Mỗi dòng (mã · size · ngày) xếp liền thành 1 khối, không trộn lẫn.</p></div>';
    const o = S.opts;
    const optc = '<div class="c3d-card"><h3>3. Cách xếp</h3><div class="c3d-radio">' +
      '<label><input type="radio" name="mrg" value="0"' + (!o.mergeTail ? ' checked' : '') + '><span><b>Tách riêng từng mặt hàng</b><small>Mỗi mặt hàng bắt đầu ở 1 vách mới, ranh giới rõ ràng.</small></span></label>' +
      '<label><input type="radio" name="mrg" value="1"' + (o.mergeTail ? ' checked' : '') + '><span><b>Ghép lấp chỗ trống cạnh vách cuối</b> (khuyên dùng — không để trống giữa các mặt hàng)<small>Mặt hàng kế tiếp xếp vào phần trống cạnh mặt hàng trước (cùng vách, khác cột) — tiết kiệm chỗ hơn.</small></span></label></div>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Bề ngang cont thường dư 1 khe nhỏ dồn về 1 vách. Bật: tự đóng so le trái/phải từng tầng (không mất chỗ); cont còn trống nhiều thì ưu tiên thoáng khí + dựng đứng"><input type="checkbox" id="oAuto"' + (o.autoLayout !== false ? ' checked' : '') + '> Tự sắp xếp hợp lý khi trống một bên (so le trái/phải, ưu tiên thoáng khí)</label>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Khi hàng ít hơn sức chứa: không đóng đặc ít dãy cao rồi để trống phía sau (dễ đổ) mà hạ số tầng, trải thành nhiều dãy thấp hơn"><input type="checkbox" id="oSpread"' + (o.spread ? ' checked' : '') + '> Hàng ít: trải đều nhiều dãy thấp (chắc hàng, không để dãy cao đứng riêng)</label>' + (o.spread ? '<div class="c3d-grid g2" style="margin-top:6px">' + fld('Trải tối đa <span class="u">(% chiều dài chứa hàng; 100 = đủ mọi dãy vừa cont)</span>', 'id="oSpreadPct"', o.spreadPct || 70) + '</div>' : '') +
      '<label class="c3d-chk" style="margin-top:9px" title="Hết mặt hàng này, mặt hàng sau được chồng lên khoảng trống phía trên vách cuối của mặt hàng trước (nếu còn chiều cao dưới red line)"><input type="checkbox" id="oStack"' + (o.stackTop !== false ? ' checked' : '') + '> Cho mặt hàng sau chồng lên khoảng trống phía trên mặt hàng trước</label>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Đóng hàng theo thứ tự cao → thấp từ trong cùng ra cửa: dãy phía trong KHÔNG được thấp hơn dãy phía ngoài. Vách thiếu thùng ở cuối mỗi mặt hàng được xếp cột đầy tới red line (hẹp hơn) thay vì xếp thấp. Tắt nếu cần đóng thêm thùng."><input type="checkbox" id="oHeight"' + (o.heightRule !== false ? ' checked' : '') + '> Xếp từ cao xuống thấp (trong cùng → cửa cont)</label>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Bật: hệ thống tự dành 2 dãy cuối (sát cửa) làm hàng mẫu hải quan, trộn đủ mọi mặt hàng / mọi date, mỗi dãy đầy đặn như các dãy khác; số thùng mẫu mỗi mặt hàng tự tính (khoảng 10–30). Tắt: không đánh dấu hàng mẫu."><input type="checkbox" id="oSampleOn"' + (o.sampleOn !== false ? ' checked' : '') + '> Hàng mẫu hải quan: tự chia ở các dãy cuối, trộn đủ mọi mặt hàng</label>' +
      (o.sampleOn !== false ? '<div class="c3d-note" style="margin:4px 0 0">Không cần nhập số lượng: các dãy ĐÓNG SAU CÙNG (sát cửa) tự trộn đủ mọi mặt hàng / date (VD 1 dãy 50 thùng chia 15 · 15 · 20), các dãy phía trong vẫn đều như thường. Đã nằm trong SL và tải trọng.</div>' : '<div class="c3d-note" style="margin:4px 0 0">Đang TẮT: không đánh dấu hàng mẫu hải quan.</div>') +
      '<div class="c3d-grid g2" style="margin-top:9px"><label class="c3d-f"><span>Thứ tự đóng</span><select id="oSort"><option value="auto"' + (o.sortMode !== 'manual' ? ' selected' : '') + '>Mặt hàng › Size › Ngày (tự động)</option><option value="manual"' + (o.sortMode === 'manual' ? ' selected' : '') + '>Đúng thứ tự tôi nhập</option></select></label>' +
      '<label class="c3d-f"><span>Ngày (trong cùng size)</span><select id="oDate"><option value="asc"' + (o.dateDir !== 'desc' ? ' selected' : '') + '>Ngày cũ vào trong trước</option><option value="desc"' + (o.dateDir === 'desc' ? ' selected' : '') + '>Ngày mới vào trong trước</option></select></label></div></div>';
    $('c3dSide').innerHTML = cont + skus + optc; updateRo();
  }
  function skuCard(k, i) {
    const col = colorFor(k.code), u = S.unit, a = 'data-s="' + esc(k.id) + '"';
    const chk = (key, label, title) => '<label class="c3d-chk" title="' + esc(k.orient && ['allowRotate', 'allowStand', 'allowLay'].includes(key) ? 'Đang chốt hướng đặt thủ công — chọn “Tự động” để dùng lại ô này' : (title || '')) + '"><input type="checkbox" ' + a + ' data-f="' + key + '"' + (k[key] ? ' checked' : '') + (k.orient && ['allowRotate', 'allowStand', 'allowLay'].includes(key) ? ' disabled' : '') + '> ' + label + '</label>';
    return '<div class="c3d-sku" style="--sk:' + col + '" ' + a + '><div class="c3d-sku-h"><span class="no">#' + (i + 1) + '</span><input type="color" value="' + col + '" data-colorcode="' + esc(k.code) + '" title="Màu của mã hàng này (các dòng cùng mã hàng dùng chung màu)"><span class="sp"></span>' +
      '<button type="button" class="c3d-btn sm" data-act="sCatSave" ' + a + ' title="Lưu kích thước + kg + cách xếp của loại thùng này vào danh mục để dùng cho các cont sau">Lưu danh mục</button><button type="button" class="c3d-btn sm" data-act="sDup" ' + a + ' title="Nhân bản dòng này (đổi size / ngày)">Nhân bản</button><button type="button" class="c3d-btn sm danger" data-act="sDel" ' + a + '>Xóa</button></div>' +
      '<div class="c3d-grid">' + '<label class="c3d-f span2"><span>Mã hàng (mặt hàng)</span><input type="text" ' + a + ' data-f="code" value="' + esc(k.code) + '" placeholder="VD: VRHL…"></label>' + fld('SL thùng', a + ' data-f="qty"', k.qty) +
      '<label class="c3d-f"><span>Size</span><input type="text" ' + a + ' data-f="size" value="' + esc(k.size) + '" placeholder="31/40"></label><label class="c3d-f"><span>Date (ngày SX)</span><input type="text" ' + a + ' data-f="date" value="' + esc(k.date) + '" placeholder="dd/mm/yyyy"></label>' + fld('kg / thùng', a + ' data-f="kg"', k.kg) + '</div>' +
      '<div class="c3d-grid" style="margin-top:6px">' + fld('Dài thùng <span class="u">(' + u + ')</span>', a + ' data-f="L" data-len="1"', toU(k.L)) + fld('Rộng thùng <span class="u">(' + u + ')</span>', a + ' data-f="W" data-len="1"', toU(k.W)) + fld('Cao thùng <span class="u">(' + u + ')</span>', a + ' data-f="H" data-len="1"', toU(k.H)) + '</div>' +
      '<div class="c3d-note" style="margin:0 0 6px" data-vol="' + esc(k.id) + '">' + volText(k) + '</div>' + catNote(k, a) + '<label class="c3d-f span3" style="margin-bottom:6px"><span>Hướng đặt thùng <span class="u">(tự xoay cho khớp thực tế — hệ thống xếp theo hướng bạn chọn)</span></span><select ' + a + ' data-f="orient">' + oriOpts(k.orient, k) + '</select></label>' + '<label class="c3d-f span3" style="margin-bottom:6px"><span>Dãy mẫu — cách xếp trong 1 LỚP của 1 dãy <span class="u">(VD: 6 nằm 2 đứng · các dãy còn lại lặp lại mẫu này · để trống = tự động)</span></span><div style="display:flex;gap:6px"><input type="text" ' + a + ' data-f="rowPlan" value="' + esc(k.rowPlan || '') + '" placeholder="VD: 6 nằm 2 đứng"><button type="button" class="c3d-btn sm" data-act="sTpl" ' + a + ' style="white-space:nowrap">Sắp dãy mẫu…</button></div></label>' + (k.rowSet && Object.keys(k.rowSet).length ? '<div class="c3d-note" style="margin:0 0 6px">Đang chỉnh riêng ' + Object.keys(k.rowSet).length + ' dãy bằng tay. <button type="button" class="c3d-btn sm" data-act="sRowClr" ' + a + '>Bỏ chỉnh từng dãy</button></div>' : '') + '<div class="c3d-flags">' + chk('allowRotate', 'Cho xoay', 'Xoay thùng 90° trên mặt sàn (đổi dài ↔ rộng)') + chk('allowStand', 'Giữ cao gốc', 'Cho đặt đúng chiều CAO bạn nhập thẳng đứng') + chk('allowLay', 'Cho lật', 'Cho phép lật thùng (đổi chiều cao thành chiều dài / rộng): nằm ↔ đứng ↔ dựng cao') + chk('sole', 'Xếp sole', 'So le trái/phải: tầng 1 dồn sát vách này chừa khe vách kia, tầng 2 ngược lại → có đường thoáng cho hơi lạnh chạy dọc cont') + '</div>' +
      '<div class="c3d-grid g2">' + fld('Chồng tối đa <span class="u">(tầng, 0 = không giới hạn)</span>', a + ' data-f="maxLayers"', k.maxLayers || 0) + '<label class="c3d-f"><span>Tên hàng (không bắt buộc)</span><input type="text" ' + a + ' data-f="name" value="' + esc(k.name) + '"></label>' +
      '<label class="c3d-f span2"><span>Ghi chú đặc biệt khi đóng hàng</span><input type="text" ' + a + ' data-f="note" value="' + esc(k.note) + '" placeholder="VD: không chồng quá 5 tầng, hàng dễ vỡ, để sát cửa…"></label></div></div>';
  }
  const ONAME = { L: 'Dài', W: 'Rộng', H: 'Cao' };
  // Tên hướng theo CHIỀU CAO THÙNG khi đặt (cách gọi ngoài kho): cao nhỏ nhất = NẰM, cao vừa = ĐỨNG, cao lớn nhất = DỰNG CAO
  const vname = (dz, sk) => { const v = [sk.L, sk.W, sk.H].slice().sort((a, b) => a - b); return Math.abs(dz - v[0]) < 0.01 ? 'nằm' : (Math.abs(dz - v[1]) < 0.01 ? 'đứng' : 'dựng cao'); };
  const oriLabel = (p, sk) => { if (!sk) return ONAME[p[0]] + ' dọc cont · ' + ONAME[p[1]] + ' ngang · ' + ONAME[p[2]] + ' đứng'; const m = { L: sk.L, W: sk.W, H: sk.H }; return vname(m[p[2]], sk).toUpperCase() + ' · cao ' + Math.round(m[p[2]]) + ' (dọc cont ' + Math.round(m[p[0]]) + ' · ngang ' + Math.round(m[p[1]]) + ')'; };
  const oriOpts = (cur, sk) => '<option value=""' + (!cur ? ' selected' : '') + '>Tự động (hệ thống chọn hướng tốt nhất)</option>' + E.PERMS.map((p) => '<option value="' + p + '"' + (cur === p ? ' selected' : '') + '>' + oriLabel(p, sk) + '</option>').join('');
  const tokText = (t) => ({ nam: 'nằm', dung: 'đứng', cao: 'dựng cao' }[t] || t);
  const permOfBox = (b, k) => { const m = { L: k.L, W: k.W, H: k.H }; return E.PERMS.find((p) => Math.abs(m[p[0]] - b.dx) < 0.01 && Math.abs(m[p[1]] - b.dy) < 0.01 && Math.abs(m[p[2]] - b.dz) < 0.01) || ''; };
  function catNote(k, a) { const cm = S.cat.find((c) => catKey(c.v) === catKey(k)); if (!cm || !String(k.code || '').trim()) return ''; const d = ['L', 'W', 'H', 'kg'].some((f) => Math.abs((cm.v[f] || 0) - (k[f] || 0)) > 0.001); return d ? '<div class="c3d-note" style="margin:0 0 6px;color:#e0a100">Danh mục có loại này với kích thước <b>' + Math.round(cm.v.L) + '×' + Math.round(cm.v.W) + '×' + Math.round(cm.v.H) + ' mm · ' + fmt(cm.v.kg, 2) + ' kg</b>. <button type="button" class="c3d-btn sm" data-act="sCatUse" ' + a + '>Dùng kích thước danh mục</button> <button type="button" class="c3d-btn sm" data-act="sCatSave" ' + a + '>Cập nhật danh mục theo dòng này</button></div>' : '<div class="c3d-note" style="margin:0 0 6px">✓ Khớp danh mục loại thùng.</div>'; }
  const volText = (k) => 'Khối 1 thùng: <b>' + fmt(k.L * k.W * k.H / 1e9, 4) + ' m³</b> · tổng ' + fmt(k.qty) + ' thùng: <b>' + fmt(k.L * k.W * k.H * k.qty / 1e9, 2) + ' m³</b>';
  function updVol(id) { const k = S.skus.find((x) => x.id === id), el = document.querySelector('[data-vol="' + id + '"]'); if (k && el) el.innerHTML = volText(k); }
  function updateRo() {
    const c = S.cont, el = $('cRo'); if (!el) return; const red = c.redLine > 0 ? c.redLine : c.H, eff = Math.min(c.H, red, c.doorH > 0 ? c.doorH : c.H);
    const vol = c.L * c.W * c.H / 1e9, lu = c.L - c.clearFront - c.clearRear, wu = c.W - 2 * c.clearSide;
    el.innerHTML = '<span>Thể tích trong: <b>' + fmt(vol, 2) + ' m³</b></span><span>Chứa hàng được (tới giới hạn xếp, trừ khe): <b>' + fmt(lu * wu * eff / 1e9, 2) + ' m³</b></span><span>Cao xếp tối đa: <b>' + fmtM(eff) + '</b></span><span>Vùng chứa hàng: <b>' + fmtM(lu) + ' × ' + fmtM(wu) + '</b></span>' + (c.doorH > 0 && c.redLine > 0 && c.doorH < c.redLine ? '<span class="warn"><b>⚠ Cao cửa thấp hơn red line — lấy theo cao cửa</b></span>' : '') + (!(c.redLine > 0) ? '<span class="warn"><b>⚠ Chưa nhập red line</b></span>' : '');
    const cap = lu * wu * eff / 1e9, pv = vol > 0 ? Math.max(0, Math.min(100, cap / vol * 100)) : 0, ph = c.H > 0 ? Math.max(0, Math.min(100, eff / c.H * 100)) : 0;
    el.insertAdjacentHTML('beforeend', '<div class="c3d-pb"><div class="r"><span>Thể tích chứa được / thể tích trong</span><b>' + fmt(pv, 0) + '%</b></div><div class="c3d-bar"><i style="width:' + pv + '%"></i></div></div><div class="c3d-pb"><div class="r"><span>Cao xếp tối đa / cao trong</span><b>' + fmt(ph, 0) + '%</b></div><div class="c3d-bar hi"><i style="width:' + ph + '%"></i></div></div>');
  }

  // ------------------------------------------------------------------ sự kiện cột trái
  function onSideInput(e) {
    const t = e.target;
    if (t.dataset.c) { // container
      const k = t.dataset.c; if (k === 'name' || k === 'type') S.cont[k] = t.value; else if (k === 'maxPayload') S.cont[k] = num(t.value); else S.cont[k] = fromU(t.value);
      updateRo(); scheduleCalc(); scheduleSave(); return;
    }
    if (t.id === 'oSpreadPct') { S.opts.spreadPct = Math.min(100, Math.max(20, num(t.value) || 70)); scheduleCalc(); scheduleSave(); return; }
    if (t.dataset.s && t.dataset.f) {
      const k = S.skus.find((x) => x.id === t.dataset.s); if (!k) return; const fl = t.dataset.f;
      if (t.type === 'checkbox') { k[fl] = t.checked; } else if (t.dataset.len) k[fl] = fromU(t.value); else if (['qty', 'maxLayers'].includes(fl)) k[fl] = Math.max(0, Math.floor(num(t.value))); else if (fl === 'kg') k[fl] = num(t.value); else k[fl] = t.value;
      if (fl === 'code') { const card = t.closest('.c3d-sku'); if (card) { const col = colorFor(k.code); card.style.setProperty('--sk', col); const ci = card.querySelector('input[type=color]'); if (ci) { ci.value = col; ci.dataset.colorcode = k.code; } } }
      updVol(k.id); scheduleCalc(); scheduleSave();
    }
  }
  function onSideChange(e) {
    const t = e.target;
    if (t.id === 'cSel') { pickContainer(t.value); renderSide(); scheduleCalc(0); if (S.view) S.view.setPreset(curView()); scheduleSave(); return; }
    if (t.id === 'cUnit') { S.unit = t.value; renderSide(); scheduleSave(); return; }
    if (t.name === 'mrg') { S.opts.mergeTail = t.value === '1'; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oSampleOn') { S.opts.sampleOn = t.checked; renderSide(); scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oHeight') { S.opts.heightRule = t.checked; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oSpread') { S.opts.spread = t.checked; renderSide(); scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oAuto') { S.opts.autoLayout = t.checked; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oStack') { S.opts.stackTop = t.checked; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oSort') { S.opts.sortMode = t.value; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oDate') { S.opts.dateDir = t.value; scheduleCalc(0); scheduleSave(); return; }
    if (t.dataset.colorcode != null) { S.colors[String(t.dataset.colorcode).trim() || '(trống)'] = t.value; renderSide(); applyColors(); scheduleSave(); return; }
    if (t.dataset.s && t.dataset.f === 'orient') { const k = S.skus.find((x) => x.id === t.dataset.s); if (k) { k.orient = t.value; renderSide(); scheduleCalc(0); scheduleSave(); } return; }
    if (t.dataset.s && t.type === 'checkbox') {
      const k = S.skus.find((x) => x.id === t.dataset.s); if (k) { k[t.dataset.f] = t.checked; scheduleCalc(0); scheduleSave(); }
      return;
    }
    // chuẩn hoá chữ số ngay TẠI Ô (KHÔNG vẽ lại cả cột: vẽ lại lúc ô mất tiêu điểm sẽ nuốt mất cú bấm nút "Lưu…" ngay sau đó)
    if (t.dataset.c && CKEYS.includes(t.dataset.c)) t.value = toU(S.cont[t.dataset.c]);
    else if (t.dataset.c === 'maxPayload') t.value = String(S.cont.maxPayload || '');
    else if (t.dataset.s && t.dataset.len) { const k = S.skus.find((x) => x.id === t.dataset.s); if (k) t.value = toU(k[t.dataset.f]); }
  }
  async function onSideClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, id = b.dataset.s;
    if (act === 'sAdd') { S.skus.push(newSku()); renderSide(); scheduleCalc(0); scheduleSave(); const cards = document.querySelectorAll('.c3d-sku'); const last = cards[cards.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); const ip = last.querySelector('[data-f=code]'); if (ip) ip.focus(); } }
    else if (act === 'sDel') { S.skus = S.skus.filter((x) => x.id !== id); renderSide(); scheduleCalc(0); scheduleSave(); }
    else if (act === 'sDup') { const i = S.skus.findIndex((x) => x.id === id); if (i >= 0) { const c = clone(S.skus[i]); c.id = newSku().id; S.skus.splice(i + 1, 0, c); renderSide(); scheduleCalc(0); scheduleSave(); } }
    else if (act === 'sClear') { if (!S.skus.length || confirm('Xóa toàn bộ danh sách hàng hóa?')) { S.skus = []; renderSide(); scheduleCalc(0); scheduleSave(); } }
    else if (act === 'sDemo') { if (S.skus.length && !confirm('Thay danh sách hàng hiện tại bằng ví dụ mẫu?')) return; S.skus = demoSkus(); renderSide(); scheduleCalc(0); scheduleSave(); }
    else if (act === 'sRowClr') { const k = S.skus.find((x) => x.id === id); if (k) { k.rowSet = {}; renderSide(); scheduleCalc(0); scheduleSave(); } }
    else if (act === 'sTpl') openTpl(id);
    else if (act === 'sCat') openCat();
    else if (act === 'sCatSave') saveSkuToCat(id);
    else if (act === 'sCatUse') { const k = S.skus.find((x) => x.id === id), cm = k && S.cat.find((c) => catKey(c.v) === catKey(k)); if (cm) { CAT_FIELDS.forEach((f) => { if (f !== 'code' && f !== 'size') k[f] = cm.v[f] === undefined ? '' : clone(cm.v[f]); }); renderSide(); scheduleCalc(0); scheduleSave(); toast('Đã dùng kích thước trong danh mục.'); } }
    else if (act === 'sPaste') openPaste();
    else if (act === 'cSave') saveContainer(false);
    else if (act === 'cSaveNew') saveContainer(true);
    else if (act === 'cDel') delContainer();
  }
  function demoSkus() {
    const mk = (o) => newSku(Object.assign({ L: 520, W: 280, H: 190, kg: 10 }, o));
    return [
      mk({ code: 'VRHLCK', size: '31/40', date: '15/09/2026', qty: 420, name: 'Tôm HLSO' }), mk({ code: 'VRHLCK', size: '31/40', date: '22/09/2026', qty: 360, name: 'Tôm HLSO' }),
      mk({ code: 'VRHLCK', size: '41/50', date: '20/09/2026', qty: 480, name: 'Tôm HLSO' }), mk({ code: 'VRPDTO', size: '51/60', date: '18/09/2026', qty: 300, name: 'Tôm PDTO', L: 600, W: 400, H: 220, kg: 12, sole: true, note: 'Xếp sole, để sát cửa' }),
    ];
  }

  // ------------------------------------------------------------------ lưu container
  async function saveContainer(asNew) {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không lưu được container.'); return; }
    const c = clone(S.cont); if (!String(c.name || '').trim()) { toast('Nhập tên container trước khi lưu.'); return; }
    let id = S.cid; const cur = contList().find((x) => x.id === S.cid);
    if (asNew || !cur) { id = 'cx' + Date.now().toString(36); if (contList().some((x) => x.name === c.name)) c.name += ' (bản sao)'; }
    c.id = id; delete c.builtin; delete c.edited;
    const i = S.saved.findIndex((x) => x.id === id); if (i >= 0) S.saved[i] = { id, v: c }; else S.saved.push({ id, v: c });
    try { await persistContainers(); S.cid = id; S.cont = clone(c); renderSide(); toast(asNew ? 'Đã lưu thành container mới.' : 'Đã lưu thay đổi container.'); scheduleSave(); } catch (e) { toast('Không lưu được: ' + (e.message || e)); }
  }
  async function delContainer() {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không xóa được.'); return; }
    const cur = contList().find((x) => x.id === S.cid); if (!cur) return;
    if (cur.builtin) { if (!cur.edited) { toast('Đây là thông số mẫu gốc, chưa sửa.'); return; } if (!confirm('Khôi phục "' + cur.name + '" về thông số mẫu gốc?')) return; }
    else if (!confirm('Xóa container "' + cur.name + '"?')) return;
    S.saved = S.saved.filter((x) => x.id !== S.cid);
    try { await persistContainers(); pickContainer(cur.builtin ? cur.id : 'rf40hc'); renderSide(); scheduleCalc(0); toast(cur.builtin ? 'Đã khôi phục mẫu gốc.' : 'Đã xóa container.'); scheduleSave(); } catch (e) { toast('Không lưu được: ' + (e.message || e)); }
  }

  // ------------------------------------------------------------------ dán từ Excel
  function openPaste() {
    $('c3dDlg').innerHTML = '<h2>Dán danh sách hàng từ Excel</h2><p class="c3d-note" style="margin-top:0">Copy các ô trong Excel rồi dán vào đây. Thứ tự cột: <b>Mã hàng · Size · Date · Số lượng thùng · Dài · Rộng · Cao · kg/thùng</b> (có thể thêm: Xoay · Đặt nằm · Dựng đứng · Sole · Chồng tối đa · Ghi chú; ô tích dùng 1/0 hoặc x). Kích thước tính theo đơn vị đang chọn (<b>' + S.unit + '</b>). Dòng tiêu đề (nếu có) tự bỏ qua.</p>' +
      '<textarea id="pasteTa" rows="10" placeholder="VRHLCK\t31/40\t15/09/2026\t420\t520\t280\t190\t10"></textarea><div class="foot"><button type="button" class="c3d-btn" id="pasteCancel">Hủy</button><button type="button" class="c3d-btn pri" id="pasteOk">Thêm vào danh sách</button></div>';
    $('c3dModal').hidden = false; $('pasteTa').focus();
    $('pasteCancel').onclick = closeModal;
    $('pasteOk').onclick = () => {
      const rows = $('pasteTa').value.split(/\r?\n/).map((l) => l.split('\t')).filter((r) => r.some((x) => String(x).trim())); let added = 0;
      const yes = (v, d) => { const t = String(v == null ? '' : v).trim().toLowerCase(); if (!t) return d; return ['1', 'x', 'c', 'có', 'co', 'true', 'y', 'yes', '✓'].includes(t); };
      rows.forEach((r) => {
        const L = fromU(r[4]), W = fromU(r[5]), H = fromU(r[6]); if (!(L > 0 && W > 0 && H > 0) || !(num(r[3]) > 0)) return;
        S.skus.push(newSku({ code: String(r[0] || '').trim(), size: String(r[1] || '').trim(), date: String(r[2] || '').trim(), qty: Math.floor(num(r[3])), L, W, H, kg: num(r[7]), allowRotate: yes(r[8], true), allowLay: yes(r[9], false), allowStand: yes(r[10], true), sole: yes(r[11], false), maxLayers: Math.floor(num(r[12])), note: String(r[13] || '') })); added++;
      });
      closeModal(); if (!added) { toast('Không đọc được dòng nào (cần Dài / Rộng / Cao / Số lượng là số > 0).'); return; }
      renderSide(); scheduleCalc(0); scheduleSave(); toast('Đã thêm ' + added + ' dòng hàng.');
    };
  }
  function closeModal() { $('c3dModal').hidden = true; }

  // ------------------------------------------------------------------ tính toán
  function scheduleCalc(delay) { clearTimeout(S.calcT); S.calcT = setTimeout(calc, delay == null ? 450 : delay); }
  function calc() {
    clearTimeout(S.calcT);
    const t0 = performance.now();
    try { S.plan = E.solve({ container: S.cont, skus: S.skus }, S.opts); }
    catch (err) { console.error(err); toast('Lỗi tính toán: ' + (err.message || err)); return; }
    S.ms = Math.round(performance.now() - t0); S.hidden = { tiers: new Set(), groups: new Set(), rows: new Set() }; S.seqMax = null; S.selBox = null; stopPlay();
    const gc = groupColors(S.plan); S.gcolors = gc;
    if (S.view) { S.view.setPlan(S.plan, gc); }
    renderReport(); renderLayers(); renderSeq(); $('c3dSel').hidden = true;
  }
  function applyColors() { if (!S.plan) return; S.gcolors = groupColors(S.plan); if (S.view) S.view.updateColors(S.gcolors); renderLayers(); renderReport(); }

  // ------------------------------------------------------------------ báo cáo
  function orientSummary(g) { return (g.patterns || []).map((p) => esc(p.text)).join('<br>') || '—'; }
  function renderReport() {
    const p = S.plan, el = $('c3dReport'); if (!p) { el.innerHTML = ''; return; }
    const t = p.totals;
    if (!p.groups.length || !t.requested) { el.innerHTML = '<div class="c3d-rep"><div class="c3d-empty"><b>Chưa có hàng để xếp.</b><br>Thêm mặt hàng ở khung bên trái (hoặc bấm “Ví dụ mẫu”). Khung 3D đang hiển thị container trống với red line và kích thước.</div></div>'; return; }
    const kpi = (k, v, s, cls, pct) => '<div class="c3d-kpi ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + (pct != null ? '<div class="c3d-gb"><i style="width:' + (100 - Math.max(0, Math.min(100, pct))) + '%"></i></div>' : '') + '</div>';
    const pay = t.payload > 0 ? t.kg / t.payload * 100 : 0;
    const k = '<div class="c3d-dash-h">Analytics Dashboard</div><div class="c3d-kpis">' +
      kpi('Đã xếp / yêu cầu', fmt(t.loaded) + ' / ' + fmt(t.requested), 'thùng', t.left === 0 ? 'good' : '') +
      kpi('Rớt lại kho', fmt(t.left), t.left ? 'thùng không đóng được vào cont này' : 'đủ hàng', t.left ? 'bad' : 'good') +
      kpi('Khối lượng hàng', fmtKg(t.kg), t.payload > 0 ? fmt(pay, 1) + '% tải trọng cho phép (' + fmt(t.payload) + ' kg)' : 'chưa nhập tải trọng', '', t.payload > 0 ? pay : null) +
      kpi('Khối hàng đã xếp', m3(t.volBox) + ' m³', 'lấp ' + fmt(t.fillUsablePct, 1) + '% vùng chứa hàng (' + m3(t.volUsable) + ' m³)', '', t.fillUsablePct) +
      kpi('Khối còn trống', m3(t.volFreeUsable) + ' m³', 'tới giới hạn xếp · cả cont còn ' + m3(t.volFreeInternal) + ' / ' + m3(t.volInternal) + ' m³') +
      kpi('Chiều dài đã dùng', fmt(t.usedLength / 1000, 2) + ' m', 'còn trống ' + fmt(t.freeLength / 1000, 2) + ' m trước cửa') +
      kpi('Cao xếp tối đa', fmt(t.effH / 1000, 2) + ' m', 'số lớp cao nhất: ' + p.maxTier) +
      (t.cog ? kpi('Trọng tâm hàng', fmt(t.cog.xPct, 0) + '% dài · ' + fmt(t.cog.yPct, 0) + '% ngang', 'tính từ vách đầu / vách phải') : '') + '</div>';
    const g = t.gaps, gp = g ? '<div class="c3d-gaps"><b>Khoảng trống còn lại</b> <span>thùng → vách đầu <b>' + fmt(g.front) + '</b></span><span>thùng → cửa <b>' + fmt(g.door) + '</b></span><span>thùng → vách phải <b>' + fmt(g.right) + '</b></span><span>thùng → vách trái <b>' + fmt(g.left) + '</b></span><span>thùng cao nhất → trần <b>' + fmt(g.ceiling) + '</b></span><span>→ red line <b>' + fmt(g.red) + '</b></span><span>→ giới hạn xếp <b>' + fmt(g.eff) + '</b></span><em>(mm; số nhỏ nhất trên toàn cont — chọn 1 dãy để xem riêng từng dãy)</em></div>' : '';
    const msgs = [];
    if (p.errors.length) p.errors.forEach((m) => msgs.push('<div class="c3d-msg err">⛔ ' + esc(m) + '</div>'));
    (p.hints || []).forEach((h, i) => msgs.push('<div class="c3d-hint"><div>💡 <b>' + esc(h.text) + '</b><br>→ ' + (h.gain > 0 ? 'đóng thêm được <b class="g">+' + fmt(h.gain) + ' thùng</b> (' + fmt(h.loaded) + ' / ' + fmt(t.requested) + ' thùng' + (h.left ? ', còn rớt ' + fmt(h.left) : ', đủ hàng') + ')' : esc(h.note || '')) + '</div><button type="button" class="c3d-btn sm pri" data-hint="' + i + '">Áp dụng</button></div>'));
    if (p.spreadNote) msgs.push('<div class="c3d-msg tip">🧱 ' + esc(p.spreadNote) + '</div>');
    if (p.layoutNote) msgs.push('<div class="c3d-msg tip">🌬 ' + esc(p.layoutNote) + '</div>');
    if (p.verify.ok && t.loaded) msgs.push('<div class="c3d-msg ok">✔ <b>Đã kiểm tra độc lập ' + fmt(t.loaded) + ' thùng:</b> không chồng lấn · nằm trong cont, dưới red line · mỗi thùng được đỡ ≥ ' + Math.round(p.options.minSupport * 100) + '% diện tích bên dưới · thứ tự đóng từ trong ra ngoài, không thùng nào bị chắn đường vào từ cửa.</div>');
    else if (!p.verify.ok) { msgs.push('<div class="c3d-msg err"><b>Chi tiết lỗi kiểm tra:</b><br>' + p.verify.violations.slice(0, 8).map((v) => esc(v.msg)).join('<br>') + '</div>'); }
    p.warnings.forEach((m) => msgs.push('<div class="c3d-msg warn">⚠ ' + esc(m) + '</div>'));
    msgs.push('<div class="c3d-msg tip">📏 Hàng được xếp thành <b>' + fmt(t.rows) + ' dãy</b> (đánh số Dãy 1 → ' + fmt(t.rows) + ' từ vách đầu ra cửa)' + '.</div>');
    if (t.sample > 0) msgs.push('<div class="c3d-msg tip">🛃 <b>Hàng mẫu hải quan: ' + fmt(t.sample) + ' thùng</b> nằm ở ' + fmt(p.rows.filter((r) => r.samples > 0).length) + ' dãy cuối (sát cửa), trộn đủ các mặt hàng, mỗi dãy đầy như các dãy khác — thùng mẫu được tô sáng trên hình 3D.</div>');
    if (t.left > 0) {
      const lefts = p.groups.filter((g) => g.left > 0).map((g) => '<b>' + esc(g.sku.code || 'Mặt hàng') + (g.sku.size ? ' ' + esc(g.sku.size) : '') + (g.sku.date ? ' (' + esc(g.sku.date) + ')' : '') + ': ' + fmt(g.left) + ' thùng</b>');
      msgs.push('<div class="c3d-msg err">📦 <b>Rớt lại kho ' + fmt(t.left) + ' thùng</b> — ' + lefts.join(' · ') + '.</div>');
    }
    if (p.compare && p.compare.ok) {
      if (p.compare.delta > 0) msgs.push('<div class="c3d-msg tip">💡 Nếu chọn <b>' + (p.compare.mergeTail ? '“Ghép lấp chỗ trống cạnh vách cuối”' : '“Tách riêng từng mặt hàng”') + '</b> sẽ xếp được thêm <b>' + fmt(p.compare.delta) + ' thùng</b> (' + fmt(p.compare.loaded) + ' thùng).</div>');
      else if (p.compare.delta === 0 && t.left === 0 && p.compare.usedLength < t.usedLength - 100) msgs.push('<div class="c3d-msg tip">💡 Chọn <b>' + (p.compare.mergeTail ? '“Ghép lấp chỗ trống cạnh vách cuối”' : '“Tách riêng từng mặt hàng”') + '</b> cho cùng số thùng nhưng ngắn hơn ' + fmt((t.usedLength - p.compare.usedLength) / 1000, 2) + ' m chiều dài (chừa chỗ cho hàng khác).</div>');
    }
    const rows = p.groups.map((g, i) => {
      const sk = g.sku, col = (S.gcolors || [])[i] || '#888';
      const pos = g.loaded && g.xStart != null ? fmt((g.xStart - p.space.x0) / 1000, 2) + ' → ' + fmt((g.xEnd - p.space.x0) / 1000, 2) + ' m' : '—';
      const why = (g.reasons || []).map(esc).join('<br>');
      const tiers = g.loaded ? Math.max(...p.boxes.filter((b) => b.group === i).map((b) => b.tier)) : 0;
      return '<tr><td class="n">' + (i + 1) + '</td><td><span class="dot" style="background:' + col + '"></span><b>' + esc(sk.code || '(chưa có mã)') + '</b>' + (sk.name ? ' <span class="nt">' + esc(sk.name) + '</span>' : '') + '<div class="nt">Size ' + esc(sk.size || '—') + ' · Date ' + esc(sk.date || '—') + ' · ' + Math.round(sk.L) + '×' + Math.round(sk.W) + '×' + Math.round(sk.H) + ' mm · ' + fmt(sk.kg, 2) + ' kg</div></td>' +
        '<td class="n">' + fmt(g.requested) + '</td><td class="n">' + fmt(g.loaded) + (g.sample ? '<div class="nt">gồm ' + fmt(g.sample) + ' mẫu HQ</div>' : '') + (g.stackedOn ? '<div class="nt">' + fmt(g.stackedOn) + ' chồng lên hàng trước</div>' : '') + '</td><td class="n ' + (g.left ? 'left' : '') + '">' + fmt(g.left) + '</td><td>' + orientSummary(g) + (tiers ? '<div class="nt">tối đa ' + tiers + ' tầng</div>' : '') + '</td><td class="n">' + pos + '</td><td class="n">' + fmt(g.kg, 2) + '</td><td class="n">' + m3(g.volLoaded) + (g.volReq !== g.volLoaded ? ' / ' + m3(g.volReq) : '') + '<div class="nt">' + fmt(g.volUnit / 1e9, 4) + ' m³/thùng</div></td>' +
        '<td>' + (sk.note ? '<div>📝 ' + esc(sk.note) + '</div>' : '') + (why ? '<div class="why">' + why + '</div>' : '') + '</td></tr>';
    }).join('');
    const tot = '<tr class="tot"><td></td><td>Tổng cộng</td><td class="n">' + fmt(t.requested) + '</td><td class="n">' + fmt(t.loaded) + '</td><td class="n ' + (t.left ? 'left' : '') + '">' + fmt(t.left) + '</td><td></td><td class="n">' + fmt(t.usedLength / 1000, 2) + ' m</td><td class="n">' + fmt(t.kg, 2) + '</td><td class="n">' + m3(t.volBox) + '</td><td></td></tr>';
    el.innerHTML = '<div class="c3d-rep"><h3>Báo cáo sau tính toán <small style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--theme-text-faint)">· ' + esc(p.container.name || 'Container') + ' · tính trong ' + (S.ms || 0) + ' ms</small></h3>' + gp + k + msgs.join('') +
      '<div class="c3d-tw"><table class="c3d-t"><thead><tr><th class="n">STT đóng</th><th>Mặt hàng · size · date</th><th class="n">Yêu cầu</th><th class="n">Đã xếp</th><th class="n">Rớt kho</th><th>Hướng đặt / kiểu xếp</th><th class="n">Vị trí từ vách đầu</th><th class="n">KG</th><th class="n">Khối m³ (xếp / yêu cầu)</th><th>Ghi chú / lý do</th></tr></thead><tbody>' + rows + tot + '</tbody></table></div>' +
      '<p class="c3d-note">Thứ tự STT = thứ tự đóng: nhóm 1 vào SÂU NHẤT (sát vách đầu), nhóm cuối sát cửa. Hàng vượt tải trọng hoặc hết chỗ được tính vào “Rớt kho”. Kéo thanh “Thứ tự đóng” trong khung 3D để xem từng thùng được đóng theo trình tự.</p></div>';
  }

  // ------------------------------------------------------------------ lớp / nhóm / thứ tự đóng
  function renderLayers() {
    const p = S.plan, el = $('c3dLayers'); if (!p || !p.boxes.length) { el.hidden = true; return; } el.hidden = false;
    const cnt = {}; p.boxes.forEach((b) => { cnt[b.tier] = (cnt[b.tier] || 0) + 1; });
    let tiers = ''; for (let t = 1; t <= p.maxTier; t++) tiers += '<label class="c3d-ly"><input type="checkbox" data-tier="' + t + '"' + (S.hidden.tiers.has(t) ? '' : ' checked') + '><span class="t">Lớp ' + t + '</span><span class="n">' + fmt(cnt[t] || 0) + '</span></label>';
    const groups = p.groups.map((g, i) => g.loaded ? '<label class="c3d-ly"><input type="checkbox" data-grp="' + i + '"' + (S.hidden.groups.has(i) ? '' : ' checked') + '><span class="dot" style="background:' + ((S.gcolors || [])[i] || '#888') + '"></span><span class="t" title="' + esc((g.sku.code || '') + ' ' + (g.sku.size || '') + ' ' + (g.sku.date || '')) + '">' + esc(g.sku.code || 'Mặt hàng') + ' ' + esc(g.sku.size || '') + '</span><span class="n">' + fmt(g.loaded) + '</span></label>' : '').join('');
    const rcnt = rowInspector(p) + (p.rows || []).map((r) => '<div class="c3d-ly' + (S.selRow === r.row ? ' rsel' : '') + '"><input type="checkbox" data-row="' + r.row + '"' + (S.hidden.rows.has(r.row) ? '' : ' checked') + '><span class="t" data-rowsel="' + r.row + '" title="Bấm để chọn dãy này (hiện số dãy, chỉnh hướng)">Dãy ' + r.row + (r.samples ? ' <span class="bd">🛃 ' + r.samples + '</span>' : '') + '</span><span class="n">' + fmt(r.n) + '</span></div>').join('');
    el.innerHTML = '<h4>Mặt hàng <span><button type="button" class="mini" data-lyall="grp1">Tất cả</button><button type="button" class="mini" data-lyall="grp0">Ẩn hết</button></span></h4>' + groups +
      '<h4 style="margin-top:8px">Lớp hàng (tầng) <span><button type="button" class="mini" data-lyall="t1">Tất cả</button><button type="button" class="mini" data-lyall="t0">Ẩn hết</button></span></h4>' + tiers +
      '<h4 style="margin-top:8px">Dãy (vách → cửa) <span><button type="button" class="mini" data-lyall="r1">Tất cả</button><button type="button" class="mini" data-lyall="r0">Ẩn hết</button></span></h4>' + rcnt;
  }
  // Bảng chỉnh HƯỚNG cho 1 dãy: người dùng chọn đứng / nằm / 1 trong 6 hướng cho dãy này; các dãy còn lại hệ thống tự sắp lại
  function rowInspector(p) {
    const r = S.selRow != null ? (p.rows || []).find((x) => x.row === S.selRow) : null; if (!r) return '<div class="c3d-note" style="margin:2px 0 6px;font-size:11px">Bấm chữ “Dãy n” (hoặc 1 thùng trong hình) để chọn dãy: hiện số dãy + chỉnh hướng đứng / nằm.</div>';
    if (r.wall < 0 || r.group < 0) return '<div class="c3d-rowbox"><b>Dãy ' + r.row + '</b><small>Dãy này gồm nhiều mặt hàng ghép — không chỉnh hướng riêng được.</small></div>';
    const sk = S.skus.find((x) => x.id === p.groups[r.group].sku.id) || p.groups[r.group].sku, cur = (sk.rowSet && sk.rowSet[r.wall]) || '';
    const isTxt = /\d/.test(String(cur));
    const opts = [['', 'Theo dãy mẫu / tự động'], ['nam', 'Cả dãy NẰM'], ['dung', 'Cả dãy ĐỨNG'], ['cao', 'Cả dãy DỰNG CAO']].concat(E.PERMS.map((q) => [q, oriLabel(q, sk)])).map((o) => '<option value="' + o[0] + '"' + (!isTxt && cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
    const gp = r.gaps ? '<div class="c3d-gp">Còn trống: trần <b>' + fmt(r.gaps.ceiling) + '</b> · red line <b>' + fmt(r.gaps.red) + '</b> · vách phải <b>' + fmt(r.gaps.right) + '</b> · vách trái <b>' + fmt(r.gaps.left) + '</b> mm</div>' : '';
    return '<div class="c3d-rowbox"><b>Dãy ' + r.row + '</b> · ' + esc((sk.code || 'mặt hàng') + ' ' + (sk.size || '')) + ' · dãy thứ ' + (r.wall + 1) + ' của mặt hàng' + gp + '<select id="rowOri">' + opts + '</select><input type="text" id="rowTxt" value="' + esc(isTxt ? cur : '') + '" placeholder="hoặc nhập riêng: 5 nằm 3 đứng" style="margin-bottom:4px"><div class="btns"><button type="button" class="c3d-btn sm pri" data-rowapply="1">Áp dụng cho dãy này</button><button type="button" class="c3d-btn sm" data-rowclear="1">Bỏ chỉnh</button></div><small>Các dãy khác tự sắp lại theo. Muốn đổi CẢ mặt hàng: nhập ở ô <b>Dãy mẫu</b> của mặt hàng.</small></div>';
  }
  function applyRowOri(clear) {
    const p = S.plan, r = p && (p.rows || []).find((x) => x.row === S.selRow); if (!r || r.wall < 0 || r.group < 0) return;
    const sk = S.skus.find((x) => x.id === p.groups[r.group].sku.id); if (!sk) return; sk.rowSet = sk.rowSet || {}; const v = clear ? '' : (($('rowTxt').value || '').trim() || $('rowOri').value);
    if (v) sk.rowSet[r.wall] = v; else delete sk.rowSet[r.wall];
    renderSide(); calc(); scheduleSave(); toast(v ? 'Đã đặt dãy ' + r.row + ': ' + (/\d/.test(v) ? v : (tokText(v) === v ? oriLabel(v, sk) : 'cả dãy ' + tokText(v))) + ' — các dãy khác đã tự sắp lại.' : 'Dãy ' + r.row + ' về tự động.');
  }
  // ---- Bảng SẮP DÃY MẪU: chọn trong 1 lớp của 1 dãy có bao nhiêu cột NẰM / ĐỨNG / DỰNG CAO (mỗi nhóm cột có thể ghi số tầng riêng); xem trước mặt cắt nhìn từ cửa
  const TP = { id: null, specs: [] };
  function tplStr() { return TP.specs.filter((q) => q.n > 0).map((q) => q.n + ' ' + tokText(q.tok) + (q.t > 0 ? ' x' + q.t : '')).join(' '); }
  function tplPreviewHtml(k) {
    const pv = E.previewTpl(k, S.cont, tplStr()), c = S.cont, W = c.W, H = c.H, sc = Math.min(430 / W, 250 / H), pad = 14, wpx = W * sc, hpx = H * sc;
    const COL = { 'nằm': '#3b82f6', 'đứng': '#f59e0b', 'dựng cao': '#22c55e' }; let x = c.clearSide || 0, rects = '';
    pv.cols.forEach((q) => { for (let t = 0; t < q.T; t++) rects += '<rect x="' + (pad + x * sc).toFixed(1) + '" y="' + (pad + (H - (t + 1) * q.dz) * sc).toFixed(1) + '" width="' + (q.dy * sc).toFixed(1) + '" height="' + (q.dz * sc).toFixed(1) + '" fill="' + (COL[q.name] || '#888') + '" stroke="#0b0f14" stroke-width="0.6" opacity="0.92"/>'; x += q.dy; });
    const ry = pad + (H - pv.red) * sc, ey = pad + (H - pv.effH) * sc;
    const svg = '<svg viewBox="0 0 ' + (wpx + 2 * pad).toFixed(0) + ' ' + (hpx + 2 * pad).toFixed(0) + '" style="width:100%;max-width:470px;background:var(--theme-panel-2);border:1px solid var(--theme-border);border-radius:9px"><rect x="' + pad + '" y="' + pad + '" width="' + wpx.toFixed(1) + '" height="' + hpx.toFixed(1) + '" fill="none" stroke="#8aa0c0" stroke-width="1.5"/>' + rects + '<line x1="' + pad + '" x2="' + (pad + wpx).toFixed(1) + '" y1="' + ry.toFixed(1) + '" y2="' + ry.toFixed(1) + '" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5 3"/>' + (pv.effH < pv.red - 1 ? '<line x1="' + pad + '" x2="' + (pad + wpx).toFixed(1) + '" y1="' + ey.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3 3"/>' : '') + '<text x="' + (pad + 4) + '" y="' + (ry - 3).toFixed(1) + '" fill="#ef4444" font-size="9">red line ' + Math.round(pv.red) + '</text></svg>';
    const warn = []; (pv.detail || []).forEach((d) => { if (!d.ok) warn.push('“' + d.n + ' ' + tokText(d.tok) + '” không vừa cont (cao / ngang).'); else if (d.used < d.n) warn.push('“' + d.n + ' ' + tokText(d.tok) + '” chỉ xếp được ' + d.used + ' cột (hết bề ngang).'); });
    const free = pv.Wu - pv.width;
    const stats = '<div class="c3d-note" style="margin:6px 0"><b>' + fmt(pv.cap) + ' thùng / dãy</b> · bề ngang dùng <b>' + fmt(pv.width) + '</b> / ' + fmt(pv.Wu) + ' mm (còn trống <b>' + fmt(free) + '</b>) · cột cao nhất <b>' + fmt(pv.top) + '</b> mm → cách red line <b>' + fmt(pv.red - pv.top) + '</b> mm, cách trần <b>' + fmt(H - pv.top) + '</b> mm' + (pv.top > pv.effH + 0.5 ? ' <span style="color:#e5484d">⚠ vượt giới hạn xếp ' + fmt(pv.effH) + '</span>' : '') + '</div>' + warn.map((w) => '<div class="c3d-msg warn">⚠ ' + esc(w) + '</div>').join('');
    return svg + stats;
  }
  function openTpl(id) {
    const k = S.skus.find((x) => x.id === id); if (!k) return; TP.id = id;
    TP.specs = E.parseColPlan(k.rowPlan).map((q) => ({ tok: q.tok, n: q.n, t: q.t })); if (!TP.specs.length) TP.specs = [{ tok: 'nam', n: 6, t: 0 }, { tok: 'dung', n: 2, t: 0 }];
    renderTpl(); $('c3dModal').hidden = false;
  }
  function renderTpl() {
    const k = S.skus.find((x) => x.id === TP.id); if (!k) return;
    const tops = [['nam', 'NẰM · cao ' + Math.round([k.L, k.W, k.H].sort((a, b) => a - b)[0])], ['dung', 'ĐỨNG · cao ' + Math.round([k.L, k.W, k.H].sort((a, b) => a - b)[1])], ['cao', 'DỰNG CAO · cao ' + Math.round([k.L, k.W, k.H].sort((a, b) => a - b)[2])]].concat(E.PERMS.map((p) => [p, oriLabel(p, k)]));
    const rows = TP.specs.map((q, i) => '<div class="c3d-tprow"><input type="text" inputmode="numeric" data-tp="n" data-i="' + i + '" value="' + q.n + '" title="Số cột"><span>cột</span><select data-tp="tok" data-i="' + i + '">' + tops.map((o) => '<option value="' + o[0] + '"' + (q.tok === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select><span>x</span><input type="text" inputmode="numeric" data-tp="t" data-i="' + i + '" value="' + (q.t || '') + '" placeholder="tối đa" title="Số tầng (để trống = chồng tới red line)"><span>tầng</span><button type="button" class="c3d-btn sm danger" data-tp="del" data-i="' + i + '">✕</button></div>').join('');
    $('c3dDlg').innerHTML = '<h2>Sắp dãy mẫu — ' + esc((k.code || 'mặt hàng') + ' ' + (k.size || '')) + '</h2><p class="c3d-note" style="margin:0 0 8px">Trong <b>1 lớp của 1 dãy</b> xếp cạnh nhau (trái → phải, nhìn từ cửa) các nhóm cột dưới đây. Mỗi cột chồng cùng 1 hướng tới red line (hoặc đúng số tầng bạn ghi). <b>Mọi dãy của mặt hàng sẽ lặp lại mẫu này</b>; muốn 1 dãy khác thì chọn dãy đó trong khung 3D.</p><div id="tpRows">' + rows + '</div><div class="c3d-btns" style="margin:6px 0"><button type="button" class="c3d-btn sm" data-tp="add">+ Thêm nhóm cột</button></div><div id="tpPrev">' + tplPreviewHtml(k) + '</div><div class="foot"><button type="button" class="c3d-btn danger" data-tp="clear">Bỏ dãy mẫu</button><button type="button" class="c3d-btn" data-tp="cancel">Hủy</button><button type="button" class="c3d-btn pri" data-tp="ok">Áp dụng cho mặt hàng</button></div>';
  }
  function onTpl(e) {
    const t = e.target.closest('[data-tp]'); if (!t || TP.id == null) return; const act = t.dataset.tp, i = +t.dataset.i, k = S.skus.find((x) => x.id === TP.id); if (!k) return;
    if (e.type === 'input' || e.type === 'change') {
      if (act === 'n') TP.specs[i].n = Math.max(0, Math.floor(num(t.value))); else if (act === 'tok') TP.specs[i].tok = t.value; else if (act === 't') TP.specs[i].t = Math.max(0, Math.floor(num(t.value))); else return;
      $('tpPrev').innerHTML = tplPreviewHtml(k); return;
    }
    if (e.type !== 'click') return;
    if (act === 'add') { TP.specs.push({ tok: 'nam', n: 1, t: 0 }); renderTpl(); }
    else if (act === 'del') { TP.specs.splice(i, 1); renderTpl(); }
    else if (act === 'cancel') closeModal();
    else if (act === 'clear') { k.rowPlan = ''; closeModal(); renderSide(); calc(); scheduleSave(); toast('Đã bỏ dãy mẫu — về tự động.'); }
    else if (act === 'ok') { k.rowPlan = tplStr(); closeModal(); renderSide(); calc(); scheduleSave(); toast(k.rowPlan ? 'Đã áp dụng dãy mẫu: ' + k.rowPlan : 'Đã bỏ dãy mẫu.'); }
  }
  function applyFilter() {
    const p = S.plan; if (!p || !S.view) return;
    const rows = new Set(); (p.rows || []).forEach((r) => { if (!S.hidden.rows.has(r.row)) rows.add(r.row); });
    const tiers = new Set(), groups = new Set(); for (let t = 1; t <= p.maxTier; t++) if (!S.hidden.tiers.has(t)) tiers.add(t); p.groups.forEach((g, i) => { if (!S.hidden.groups.has(i)) groups.add(i); });
    S.view.setFilter({ tiers: S.hidden.tiers.size ? tiers : null, groups: S.hidden.groups.size ? groups : null, rows: S.hidden.rows.size ? rows : null, seqMax: S.seqMax });
  }
  function onLayerChange(e) {
    const t = e.target; if (t.dataset.tier) { const n = +t.dataset.tier; if (t.checked) S.hidden.tiers.delete(n); else S.hidden.tiers.add(n); applyFilter(); }
    else if (t.dataset.row) { const n = +t.dataset.row; if (t.checked) S.hidden.rows.delete(n); else S.hidden.rows.add(n); applyFilter(); }
    else if (t.dataset.grp) { const n = +t.dataset.grp; if (t.checked) S.hidden.groups.delete(n); else S.hidden.groups.add(n); applyFilter(); }
  }
  function onLayerClick(e) {
    const rs = e.target.closest('[data-rowsel]'); if (rs && S.view) { const n = +rs.dataset.rowsel; S.view.setSelRow(S.selRow === n ? null : n); return; }
    if (e.target.closest('[data-rowapply]')) { applyRowOri(false); return; } if (e.target.closest('[data-rowclear]')) { applyRowOri(true); return; }
    const b = e.target.closest('[data-lyall]'); if (!b || !S.plan) return; const k = b.dataset.lyall;
    if (k[0] === 'r') { S.hidden.rows = new Set(); if (k === 'r0') S.plan.rows.forEach((r) => S.hidden.rows.add(r.row)); }
    else if (k[0] === 't') { S.hidden.tiers = new Set(); if (k === 't0') for (let t = 1; t <= S.plan.maxTier; t++) S.hidden.tiers.add(t); } else { S.hidden.groups = new Set(); if (k === 'grp0') S.plan.groups.forEach((g, i) => S.hidden.groups.add(i)); }
    renderLayers(); applyFilter();
  }
  function renderSeq() {
    const p = S.plan, el = $('c3dSeq'); if (!p || !p.boxes.length) { el.hidden = true; return; } el.hidden = false; const n = p.boxes.length, cur = S.seqMax == null ? n : S.seqMax;
    el.innerHTML = '<span class="lab">Thứ tự đóng (trong → ngoài)</span><button type="button" class="c3d-btn sm" data-seq="start" title="Về thùng đầu tiên">⏮</button><button type="button" class="c3d-btn sm" data-seq="prev">◀</button><button type="button" class="c3d-btn sm" data-seq="play" id="seqPlay">' + (S.playing ? '⏸' : '▶') + '</button><button type="button" class="c3d-btn sm" data-seq="next">▶|</button><button type="button" class="c3d-btn sm" data-seq="end" title="Hiện tất cả">⏭</button>' +
      '<input type="range" id="seqRange" min="0" max="' + n + '" value="' + cur + '"><span class="lab" id="seqLab">' + cur + ' / ' + n + '</span>';
  }
  function setSeq(v) {
    const n = S.plan ? S.plan.boxes.length : 0; v = Math.max(0, Math.min(n, Math.round(v))); S.seqMax = v >= n ? null : v; const r = $('seqRange'); if (r) r.value = v; const l = $('seqLab'); if (l) l.textContent = v + ' / ' + n; applyFilter();
  }
  function stopPlay() { if (S.playing) { clearInterval(S.playing); S.playing = 0; } const b = $('seqPlay'); if (b) b.textContent = '▶'; }
  function onSeqClick(e) {
    const b = e.target.closest('[data-seq]'); if (!b || !S.plan) return; const n = S.plan.boxes.length, cur = S.seqMax == null ? n : S.seqMax, a = b.dataset.seq;
    if (a === 'start') { stopPlay(); setSeq(0); } else if (a === 'end') { stopPlay(); setSeq(n); } else if (a === 'prev') { stopPlay(); setSeq(cur - 1); } else if (a === 'next') { stopPlay(); setSeq(cur + 1); }
    else if (a === 'play') {
      if (S.playing) { stopPlay(); return; } if (cur >= n) setSeq(0); const step = Math.max(1, Math.round(n / 160)); b.textContent = '⏸';
      S.playing = setInterval(() => { const c2 = S.seqMax == null ? n : S.seqMax; if (c2 >= n) { stopPlay(); return; } setSeq(c2 + step); }, 40);
    }
  }

  // ------------------------------------------------------------------ rê chuột / chọn thùng
  function boxText(bi, full) {
    const p = S.plan, b = p.boxes[bi], g = p.groups[b.group], sk = g.sku, sp = p.space;
    const head = '<b>#' + b.seq + ' · ' + esc(sk.code || 'Mặt hàng') + '</b> ' + esc(sk.size || '') + (sk.date ? ' · ' + esc(sk.date) : '') + ' · <b>' + g.loaded + ' thùng</b>';
    const dims = Math.round(b.dx) + '×' + Math.round(b.dy) + '×' + Math.round(b.dz) + ' mm (dài×ngang×cao khi đặt)';
    if (!full) return head + '<br>Dãy ' + b.row + ' · Lớp ' + b.tier + ' · ' + dims;
    return head + '<br><b>Dãy ' + b.row + '</b>' + (b.sample ? '<br>🛃 <b>Thùng mẫu hải quan</b>' : '') + (b.onPrev ? '<br>↥ chồng lên hàng trước' : '') + '<br>Lớp (tầng) <b>' + b.tier + '</b> · ' + vname(b.dz, sk) + ' (cao ' + Math.round(b.dz) + ')' + (b.rot ? ' · xoay 90°' : '') + '<br>' + dims + '<br><small>Cách vách đầu ' + fmt((b.x - sp.x0) / 1000, 2) + ' m · cách vách phải ' + fmt((b.y - sp.y0) / 1000, 2) + ' m · cao ' + fmt(b.z / 1000, 2) + ' m<br>' + fmt(sk.kg, 2) + ' kg/thùng' + (sk.note ? '<br>📝 ' + esc(sk.note) : '') + '</small>';
  }
  function onHover(bi, ev) {
    const tip = $('c3dTip'); if (bi == null || !S.plan) { tip.hidden = true; return; }
    const vp = $('c3dVp').getBoundingClientRect(); tip.innerHTML = boxText(bi, false); tip.hidden = false;
    let x = ev.clientX - vp.left + 14, y = ev.clientY - vp.top + 14; if (x + 300 > vp.width) x = ev.clientX - vp.left - 310; if (y + 70 > vp.height) y = ev.clientY - vp.top - 70; tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function onPick(bi) {
    const el = $('c3dSel'); S.selBox = bi; if (bi == null || !S.plan) { el.hidden = true; return; }
    const b = S.plan.boxes[bi], sk = S.plan.groups[b.group].sku, cur = sk.orient || permOfBox(b, sk);
    el.innerHTML = '<span class="x" id="selX">✕</span>' + boxText(bi, true) + '<div style="margin-top:6px;border-top:1px solid var(--theme-border);padding-top:5px"><small>Xoay cả nhóm “' + esc(sk.code || 'mặt hàng') + ' ' + esc(sk.size || '') + '” cho khớp thực tế (hệ thống xếp lại):</small><select id="selOri">' + oriOpts(sk.orient, sk) + '</select><button type="button" class="c3d-btn sm" id="selRot" style="margin-top:5px" title="Đổi chiều dài ↔ ngang của thùng">↻ Xoay 90° trên sàn</button></div>'; el.hidden = false; $('selX').onclick = () => { S.view.select(null); };
    const setOri = (v, msg) => { const k = S.skus.find((x) => x.id === sk.id); if (!k) return; k.orient = v; renderSide(); calc(); scheduleSave(); toast(msg); };
    $('selOri').onchange = (e) => setOri(e.target.value, e.target.value ? 'Đã chốt hướng đặt: ' + oriLabel(e.target.value, sk) : 'Về chế độ tự động.');
    $('selRot').onclick = () => { const p0 = cur || 'LWH'; setOri(p0[1] + p0[0] + p0[2], 'Đã xoay 90° trên sàn: ' + oriLabel(p0[1] + p0[0] + p0[2], sk)); };
  }

  // ------------------------------------------------------------------ phương án đã lưu
  async function savePlanDialog() {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không lưu được phương án.'); return; }
    if (!S.plan || !S.plan.totals.requested) { toast('Chưa có phương án để lưu.'); return; }
    const t = new Date(), autoOpen = S.openedAuto ? S.plans.find((x) => x.id === S.openedAuto && x.data && x.data.auto) : null, def = autoOpen ? autoOpen.name : (S.cont.name || 'Cont') + ' ' + String(t.getDate()).padStart(2, '0') + '/' + String(t.getMonth() + 1).padStart(2, '0');
    $('c3dDlg').innerHTML = '<h2>Lưu phương án xếp hàng</h2><label class="c3d-f"><span>Tên phương án</span><input type="text" id="planName" value="' + esc(def) + '"></label><p class="c3d-note">Lưu container, danh sách hàng và cách xếp. Khi mở lại hệ thống tính lại theo thuật toán hiện hành.</p>' + (autoOpen ? '<label class="c3d-chk"><input type="checkbox" id="planOver" checked> Ghi đè lên phương án TỰ ĐỘNG đang mở và KHÓA lại (hệ thống không tự tính lại nữa — giữ nguyên chỉnh sửa của bạn)</label>' : '') + '<div class="foot"><button type="button" class="c3d-btn" id="planCancel">Hủy</button><button type="button" class="c3d-btn pri" id="planOk">Lưu</button></div>';
    $('c3dModal').hidden = false; $('planName').focus(); $('planName').select(); $('planCancel').onclick = closeModal;
    $('planOk').onclick = async () => {
      const name = $('planName').value.trim() || def, id = 'pl' + Date.now().toString(36), over = autoOpen && $('planOver') && $('planOver').checked;
      if (over) { // ghi đè phương án tự động + khóa
        const bk = { name: autoOpen.name, capNhat: autoOpen.capNhat, contName: autoOpen.contName, loaded: autoOpen.loaded, requested: autoOpen.requested, data: autoOpen.data };
        autoOpen.name = name; autoOpen.capNhat = new Date().toISOString(); autoOpen.contName = S.cont.name; autoOpen.loaded = S.plan.totals.loaded; autoOpen.requested = S.plan.totals.requested;
        autoOpen.data = { cont: clone(S.cont), cid: S.cid, skus: clone(S.skus), opts: clone(S.opts), colors: clone(S.colors), unit: S.unit, auto: Object.assign({}, bk.data.auto, { lock: true, edited: true, warn: [] }) };
        try { await persistPlans(); closeModal(); toast('Đã ghi đè và khóa phương án “' + name + '”.'); } catch (e) { Object.assign(autoOpen, bk); closeModal(); toast('Không lưu được: ' + (e.message || e)); } return;
      }
      S.plans.unshift({ id, name, capNhat: new Date().toISOString(), contName: S.cont.name, loaded: S.plan.totals.loaded, requested: S.plan.totals.requested, data: { cont: clone(S.cont), cid: S.cid, skus: clone(S.skus), opts: clone(S.opts), colors: clone(S.colors), unit: S.unit } });
      try { await persistPlans(); closeModal(); toast('Đã lưu phương án “' + name + '”.'); } catch (e) { S.plans.shift(); closeModal(); toast('Không lưu được: ' + (e.message || e)); }
    };
  }
  // ---- DANH MỤC LOẠI THÙNG: lưu kích thước + kg + cách xếp từng loại thùng để dùng lại cho cont sau (chỉ nhập số lượng). Khoá = mã hàng + size.
  const CAT_FIELDS = ['code', 'size', 'name', 'L', 'W', 'H', 'kg', 'allowRotate', 'allowStand', 'allowLay', 'sole', 'maxLayers', 'orient', 'rowPlan', 'note'];
  const catKey = (v) => String(v.code || '').trim().toLowerCase() + '|' + String(v.size || '').trim().toLowerCase();
  const catLabel = (v) => (String(v.code || '').trim() || '(chưa có mã)') + (v.size ? ' · ' + v.size : '') + (v.name ? ' · ' + v.name : '');
  async function persistCat() { await writeSheet(SH_T, S.cat.map((c) => ({ id: c.id, name: c.name, capNhat: c.capNhat, data: '__JSON__' + JSON.stringify(c.v) }))); }
  async function saveSkuToCat(id) {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không lưu được danh mục.'); return; }
    const k = S.skus.find((x) => x.id === id); if (!k) return; if (!String(k.code || '').trim()) { toast('Nhập Mã hàng trước khi lưu vào danh mục.'); return; } if (!(k.L > 0 && k.W > 0 && k.H > 0)) { toast('Nhập đủ Dài / Rộng / Cao thùng trước.'); return; }
    const v = {}; CAT_FIELDS.forEach((f) => { v[f] = k[f] === undefined ? '' : clone(k[f]); }); const key = catKey(v), i = S.cat.findIndex((c) => catKey(c.v) === key), rec = { id: i >= 0 ? S.cat[i].id : 'th' + Date.now().toString(36), name: catLabel(v), capNhat: new Date().toISOString(), v };
    const prev = S.cat.slice(); if (i >= 0) S.cat[i] = rec; else S.cat.push(rec);
    try { await persistCat(); renderSide(); toast((i >= 0 ? 'Đã cập nhật' : 'Đã lưu') + ' loại thùng “' + rec.name + '” vào danh mục (' + Math.round(v.L) + '×' + Math.round(v.W) + '×' + Math.round(v.H) + ' mm).'); } catch (e) { S.cat = prev; toast('Không lưu được: ' + (e.message || e)); }
  }
  const CATQ = { q: '' };
  function catListHtml() {
    const q = stripV(CATQ.q), list = S.cat.filter((c) => !q || stripV(c.name + ' ' + (c.v.note || '')).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return list.length ? list.map((c) => '<div class="c3d-plan"><div class="nm"><b>' + esc(catLabel(c.v)) + '</b><small>' + Math.round(c.v.L) + '×' + Math.round(c.v.W) + '×' + Math.round(c.v.H) + ' mm · ' + fmt(c.v.kg, 2) + ' kg/thùng · ' + fmt(c.v.L * c.v.W * c.v.H / 1e9, 4) + ' m³' + (c.v.rowPlan ? ' · dãy mẫu: ' + esc(c.v.rowPlan) : '') + '</small></div><input type="text" inputmode="numeric" data-cat="qty" data-id="' + esc(c.id) + '" value="100" style="width:70px" title="Số lượng thùng"><button type="button" class="c3d-btn sm pri" data-cat="add" data-id="' + esc(c.id) + '">Thêm vào cont</button><button type="button" class="c3d-btn sm danger" data-cat="del" data-id="' + esc(c.id) + '">Xóa</button></div>').join('') : '<div class="c3d-empty-l">' + (S.cat.length ? 'Không có loại thùng khớp.' : 'Danh mục trống. Ở mỗi mặt hàng bấm “Lưu danh mục” để lưu kích thước loại thùng đó.') + '</div>';
  }
  const stripV = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  function openCat() {
    $('c3dDlg').innerHTML = '<h2>Danh mục loại thùng</h2><p class="c3d-note" style="margin:0 0 8px">Loại thùng đã lưu (kích thước, kg, hướng đặt, dãy mẫu). Chọn loại cần dùng, nhập số lượng, bấm “Thêm vào cont” — danh sách của cont hiện tại không bị mất.</p><label class="c3d-f"><span>Tìm theo mã / size / tên</span><input type="text" data-cat="q" value="' + esc(CATQ.q) + '"></label><div id="catList" style="margin-top:8px">' + catListHtml() + '</div><div class="foot"><button type="button" class="c3d-btn" data-cat="close">Đóng</button></div>';
    $('c3dModal').hidden = false;
  }
  async function onCat(e) {
    const t = e.target.closest('[data-cat]'); if (!t) return; const act = t.dataset.cat;
    if (act === 'q' && (e.type === 'input')) { CATQ.q = t.value; $('catList').innerHTML = catListHtml(); return; }
    if (e.type !== 'click') return;
    if (act === 'close') { closeModal(); return; }
    const c = S.cat.find((x) => x.id === t.dataset.id); if (!c) return;
    if (act === 'add') { const qi = document.querySelector('[data-cat="qty"][data-id="' + c.id + '"]'), qty = Math.max(1, Math.floor(num(qi && qi.value) || 100)); S.skus.push(newSku(Object.assign({}, clone(c.v), { qty }))); renderSide(); scheduleCalc(0); scheduleSave(); toast('Đã thêm ' + catLabel(c.v) + ' × ' + fmt(qty) + ' thùng.'); }
    else if (act === 'del') { if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không xóa được.'); return; } if (!confirm('Xóa loại thùng “' + catLabel(c.v) + '” khỏi danh mục?')) return; const prev = S.cat.slice(); S.cat = S.cat.filter((x) => x.id !== c.id); try { await persistCat(); $('catList').innerHTML = catListHtml(); renderSide(); } catch (er) { S.cat = prev; toast('Không xóa được: ' + (er.message || er)); } }
  }
  async function persistPlans() { await writeSheet(SH_P, S.plans.map((p) => ({ id: p.id, name: p.name, capNhat: p.capNhat, contName: p.contName, loaded: p.loaded, requested: p.requested, data: '__JSON__' + JSON.stringify(p.data) }))); }
  function openPlans() {
    const list = S.plans.length ? S.plans.map((p) => '<div class="c3d-plan"><div class="nm"><b>' + (p.data && p.data.auto ? '<span class="c3d-autotag">TỰ ĐỘNG' + (p.data.auto.lock ? ' 🔒' : '') + '</span> ' : '') + esc(p.name) + '</b><small>' + esc(p.contName) + ' · ' + fmt(p.loaded) + '/' + fmt(p.requested) + ' thùng · ' + esc(new Date(p.capNhat).toLocaleString('vi-VN')) + '</small>' + autoWarnHtml(p) + '</div>' + (p.data && p.data.auto ? '<button type="button" class="c3d-btn sm" data-lock="' + esc(p.id) + '" title="Khóa = hệ thống không tự tính lại phương án này khi lịch xuất / tồn kho thay đổi">' + (p.data.auto.lock ? 'Mở khóa' : 'Khóa') + '</button>' : '') + '<button type="button" class="c3d-btn sm pri" data-open="' + esc(p.id) + '">Mở</button><button type="button" class="c3d-btn sm danger" data-del="' + esc(p.id) + '">Xóa</button></div>').join('') : '<div class="c3d-empty-l">Chưa có phương án nào được lưu.</div>';
    const mk = Object.keys(S.autoMiss || {}).map((k) => S.autoMiss[k]), miss = mk.length ? '<div class="c3d-msg warn" style="margin-bottom:8px">⚠ <b>Lịch xuất chưa mô phỏng đủ — thiếu kích thước thùng trong danh mục</b> (mở Container 3D → thêm mặt hàng → “Lưu danh mục”):<br>' + mk.map((m) => esc(m.name) + ': ' + m.missing.map(esc).join(', ')).join('<br>') + '</div>' : '';
    $('c3dDlg').innerHTML = '<h2>Phương án đã lưu</h2>' + miss + list + '<div class="foot"><button type="button" class="c3d-btn" id="plClose">Đóng</button></div>'; $('c3dModal').hidden = false; $('plClose').onclick = closeModal;
  }
  async function onDlgClick(e) {
    const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]'), lk = e.target.closest('[data-lock]');
    if (lk) { // PC 8.70: khóa / mở khóa phương án tự động
      if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không sửa được.'); return; } const p = S.plans.find((x) => x.id === lk.dataset.lock); if (!p || !p.data || !p.data.auto) return;
      p.data.auto.lock = !p.data.auto.lock; try { await persistPlans(); openPlans(); } catch (er) { p.data.auto.lock = !p.data.auto.lock; toast('Không lưu được: ' + (er.message || er)); } return;
    }
    if (o) { const p = S.plans.find((x) => x.id === o.dataset.open); if (!p) return; const dt = p.data; S.unit = dt.unit || 'mm'; S.cid = dt.cid || S.cid; S.cont = clone(dt.cont); S.skus = clone(dt.skus || []); S.opts = Object.assign({ mergeTail: true, stackTop: true, heightRule: true, sampleOn: true, sampleQty: 10, dateDir: 'asc', sortMode: 'auto' }, dt.opts || {}); S.colors = clone(dt.colors || {}); S.openedAuto = dt.auto ? p.id : ''; closeModal(); renderSide(); calc(); if (S.view) S.view.setPreset(curView()); scheduleSave(); toast('Đã mở phương án “' + p.name + '”.'); }
    else if (d) {
      if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không xóa được.'); return; } if (!confirm('Xóa phương án này?')) return;
      const keep = S.plans.slice(); S.plans = S.plans.filter((x) => x.id !== d.dataset.del); try { await persistPlans(); openPlans(); } catch (er) { S.plans = keep; toast('Không xóa được: ' + (er.message || er)); }
    }
  }

  // ------------------------------------------------------------------ xuất Excel / ảnh
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500); }
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  const ymd = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
  function exportExcel() {
    if (!S.user.canExport) { toast('Bạn không được cấp quyền xuất file.'); return; }
    const p = S.plan; if (!p || !p.totals.requested) { toast('Chưa có phương án để xuất.'); return; } if (!window.XLSX) { toast('Thiếu thư viện Excel.'); return; }
    const c = p.container, t = p.totals, sp = p.space, X = window.XLSX;
    const s1 = [['BÁO CÁO XẾP HÀNG CONTAINER — Container Loading 3D'], ['Ngày', ymd()], [], ['Container', c.name], ['Loại', c.type], ['Kích thước trong (D×R×C, mm)', c.L + ' × ' + c.W + ' × ' + c.H], ['Cửa (R×C, mm)', c.doorW + ' × ' + c.doorH], ['Tải trọng cho phép (kg)', c.maxPayload], ['Red line (mm)', c.redLine || ''], ['Khe vách đầu / cửa / hai bên (mm)', c.clearFront + ' / ' + c.clearRear + ' / ' + c.clearSide], ['Chiều cao xếp tối đa (mm)', sp.effH], [],
      ['Số thùng yêu cầu', t.requested], ['Số thùng đã xếp', t.loaded], ['RỚT LẠI KHO (thùng)', t.left], ['Khối lượng hàng đã xếp (kg)', Math.round(t.kg * 100) / 100], ['Thể tích trong cont (m³)', Math.round(t.volInternal / 1e7) / 100], ['Thể tích chứa hàng được (m³)', Math.round(t.volUsable / 1e7) / 100], ['Khối hàng đã xếp (m³)', Math.round(t.volBox / 1e7) / 100], ['Khối còn trống tới giới hạn xếp (m³)', Math.round(t.volFreeUsable / 1e7) / 100], ['Khối còn trống trong cả cont (m³)', Math.round(t.volFreeInternal / 1e7) / 100], ['Lấp đầy vùng chứa (%)', Math.round(t.fillUsablePct * 10) / 10], ['Chiều dài đã dùng (mm)', Math.round(t.usedLength)], ['Chiều dài còn trống trước cửa (mm)', Math.round(t.freeLength)], ['Trọng tâm dọc / ngang (%)', t.cog ? Math.round(t.cog.xPct) + ' / ' + Math.round(t.cog.yPct) : ''], ['Kiểm tra độc lập', p.verify.ok ? 'ĐẠT (không chồng, đủ đỡ, đúng thứ tự đóng)' : 'CÓ LỖI'], ['Cách xếp', p.options.mergeTail ? 'Ghép lấp chỗ trống cạnh vách cuối' : 'Tách riêng từng mặt hàng'], [], ['CẢNH BÁO']].concat(p.warnings.concat(p.errors).map((m) => [m]));
    const s2 = [['STT đóng', 'Mã hàng', 'Tên hàng', 'Size', 'Date', 'Dài (mm)', 'Rộng (mm)', 'Cao (mm)', 'kg/thùng', 'Yêu cầu', 'Đã xếp', 'Rớt lại kho', 'Kiểu xếp / hướng đặt', 'Từ vách đầu (mm)', 'Đến (mm)', 'KG đã xếp', 'Khối 1 thùng (m³)', 'Khối yêu cầu (m³)', 'Khối đã xếp (m³)', 'Ghi chú đóng hàng', 'Lý do rớt / lưu ý']].concat(p.groups.map((g, i) => [i + 1, g.sku.code, g.sku.name, g.sku.size, g.sku.date, g.sku.L, g.sku.W, g.sku.H, g.sku.kg, g.requested, g.loaded, g.left, (g.patterns || []).map((x) => x.text).join(' | '), g.xStart != null ? Math.round(g.xStart - sp.x0) : '', g.xEnd != null ? Math.round(g.xEnd - sp.x0) : '', Math.round(g.kg * 100) / 100, Math.round(g.volUnit / 1e5) / 1e4, Math.round(g.volReq / 1e7) / 100, Math.round(g.volLoaded / 1e7) / 100, g.sku.note, (g.reasons || []).join(' ')])).concat([['', 'TỔNG', '', '', '', '', '', '', '', t.requested, t.loaded, t.left, '', '', '', Math.round(t.kg * 100) / 100, '', Math.round(t.volReqAll / 1e7) / 100, Math.round(t.volBox / 1e7) / 100, '', '']]);
    const s3 = [['STT đóng', 'Dãy', 'Loại', 'Mã hàng', 'Size', 'Date', 'Lớp (tầng)', 'Cách vách đầu (mm)', 'Cách vách phải (mm)', 'Cao từ sàn (mm)', 'Dài đặt (mm)', 'Ngang đặt (mm)', 'Cao đặt (mm)', 'Hướng']].concat(p.boxes.map((b) => { const sk = p.groups[b.group].sku; return [b.seq, b.row, b.sample ? 'Mẫu hải quan' : 'Hàng chính', sk.code, sk.size, sk.date, b.tier, Math.round(b.x - sp.x0), Math.round(b.y - sp.y0), Math.round(b.z), Math.round(b.dx), Math.round(b.dy), Math.round(b.dz), (b.ori === 'dung' ? 'dựng đứng' : 'đặt nằm') + (b.rot ? ' xoay 90°' : '')]; }));
    const wb = X.utils.book_new(), add = (name, aoa, w) => { const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = w.map((x) => ({ wch: x })); X.utils.book_append_sheet(wb, ws, name); };
    add('Tổng quan', s1, [38, 60]); add('Theo mặt hàng', s2, [9, 16, 20, 10, 12, 9, 9, 9, 9, 10, 10, 11, 44, 14, 12, 12, 12, 12, 12, 34, 40]); add('Trình tự đóng', s3, [9, 7, 14, 16, 10, 12, 10, 16, 16, 14, 11, 11, 11, 18]);
    const s4 = [['Dãy', 'Từ vách đầu (mm)', 'Đến (mm)', 'Số thùng', 'Mẫu hải quan', 'Các mặt hàng trong dãy']].concat(p.rows.map((r) => { const names = []; p.boxes.forEach((b) => { if (b.row === r.row) { const sk = p.groups[b.group].sku, nm = (sk.code || '') + ' ' + (sk.size || '') + ' ' + (sk.date || ''); if (!names.includes(nm)) names.push(nm); } }); return [r.row, Math.round(r.x0 - sp.x0), Math.round(r.x1 - sp.x0), r.n, r.samples ? r.samples : '', names.join(' | ')]; }));
    add('Theo dãy', s4, [7, 16, 12, 10, 14, 70]);
    const out = X.write(wb, { bookType: 'xlsx', type: 'array' }); const name = 'XepContainer_' + safeName(c.name) + '_' + ymd() + '.xlsx';
    download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name); toast('Đã xuất ' + name);
  }
  // Đẩy cont đã lưu + phương án đã lưu lên điện thoại (bảng C3D của Đồng bộ điện thoại; điện thoại chỉ xem / mở)
  async function pushPhone() {
    if (!window.sheetsSyncAPI || !window.sheetsSyncAPI.pushModule) { toast('Không có chức năng đồng bộ điện thoại.'); return; }
    toast('Đang đẩy lên điện thoại…');
    try {
      const r = await window.sheetsSyncAPI.pushModule('module14');
      if (r && r.ok) toast('Đã đẩy ' + S.saved.length + ' cont + ' + S.plans.length + ' phương án lên điện thoại. (Chỉ các mục ĐÃ LƯU được đẩy.)');
      else toast((r && r.error) || 'Không đẩy được lên điện thoại.');
    } catch (e) { toast('Không đẩy được: ' + (e.message || e)); }
  }
  function exportPng() {
    if (!S.user.canExport) { toast('Bạn không được cấp quyền xuất file.'); return; } if (!S.view) return;
    const light = document.documentElement.getAttribute('data-theme') === 'light', url = S.view.screenshot(light ? '#fffcf2' : '#14161a'), a = document.createElement('a'); a.href = url; a.download = 'Container3D_' + safeName(S.cont.name) + '_' + ymd() + '.png'; document.body.appendChild(a); a.click(); a.remove(); toast('Đã lưu ảnh 3D.');
  }

  // ------------------------------------------------------------------ khung 3D: góc nhìn + vách
  let viewName = 'iso'; const curView = () => viewName;
  function syncWallBoxes(w) { document.querySelectorAll('[data-wall]').forEach((i) => { i.checked = !!w[i.dataset.wall]; }); }
  function bindView() {
    $('c3dViews').onclick = (e) => { const b = e.target.closest('[data-view]'); if (!b || !S.view) return; viewName = b.dataset.view; document.querySelectorAll('#c3dViews .c3d-chip').forEach((x) => x.classList.toggle('on', x === b)); S.view.setPreset(viewName); };
    $('c3dToggles').onchange = (e) => { const t = e.target; if (!S.view) return; if (t.dataset.wall) S.view.setWall(t.dataset.wall, t.checked); else if (t.dataset.opt) S.view.setOpt(t.dataset.opt, t.checked); };
    $('c3dLayers').onchange = onLayerChange; $('c3dLayers').onclick = onLayerClick; $('c3dSeq').onclick = onSeqClick; $('c3dSeq').oninput = (e) => { if (e.target.id === 'seqRange') { stopPlay(); setSeq(+e.target.value); } };
  }

  // ------------------------------------------------------------------ PC 8.70: MÔ PHỎNG TỰ ĐỘNG TỪ "LỊCH XUẤT"
  // Trang chính (lich-xuat-cont.js) gửi { type:'kla-c3d-auto', groups:[…] } mỗi khi lịch xuất được thêm / sửa / đổi LSX / dò lại tồn:
  //   mỗi group = 1 CONTAINER (cùng ngày + cùng mã "chung cont", hoặc 1 lịch) kèm các dòng hàng { ma, ten, size, qty, ton, kg, nsx, lsx } đã tính sẵn từ tồn kho theo LSX + mã hàng.
  // Ở đây: tra KÍCH THƯỚC THÙNG trong danh mục "Lưu danh mục" (khoá = mã hàng + size) → tự chọn container NHỎ NHẤT vừa đủ → E.solve → lưu thành "Phương án đã lưu" có cờ data.auto
  // (không đụng vào hàng / cont bạn đang làm dở trong màn hình). Chỉ CẢNH BÁO khi hàng không vừa / thiếu kích thước thùng / thiếu tồn. Phương án bị KHÓA (data.auto.lock) thì không bao giờ bị ghi đè.
  const AUTO_OPTS = () => ({ mergeTail: true, stackTop: true, heightRule: true, sampleOn: S.opts.sampleOn !== false, sampleQty: S.opts.sampleQty == null ? 10 : S.opts.sampleQty, dateDir: 'asc', sortMode: 'auto', autoLayout: true, spread: false, compare: false, hints: false });
  const nk = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
  function catFind(code, size) { // → { v, exact } | null
    const c = nk(code), z = nk(size); if (!c) return null;
    const ex = S.cat.find((x) => nk(x.v.code) === c && nk(x.v.size) === z); if (ex) return { v: ex.v, exact: true };
    const same = S.cat.filter((x) => { const k = nk(x.v.code); return k && (k === c || (k.length >= 6 && (c.startsWith(k) || k.startsWith(c)))); });
    const hit = same.find((x) => nk(x.v.size) === z) || same.find((x) => !nk(x.v.size)) || same[0];
    return hit ? { v: hit.v, exact: nk(hit.v.size) === z } : null;
  }
  const missCount = () => Object.keys(S.autoMiss || {}).length;
  function paintOpenBtn() { const b = $('c3dOpen'); if (b) b.textContent = 'Phương án đã lưu' + (missCount() ? ' ⚠' + missCount() : ''); }
  const autoDmy = (k) => k.slice(8, 10) + '/' + k.slice(5, 7);
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  function autoWarnHtml(p) {
    const a = p.data && p.data.auto; if (!a) return '';
    const w = a.warn || [];
    return w.length ? '<small style="color:#e0a100;display:block">⚠ ' + w.map(esc).join(' · ') + '</small>' : '';
  }
  function autoBuild(g) { // → { skus, missing, warn }
    const merged = new Map(), missing = [], warn = [];
    (g.lines || []).forEach((l) => {
      const qty = Math.max(0, Math.floor(num(l.qty))); if (!qty) return;
      const cm = catFind(l.ma, l.size), label = (String(l.ma || l.ten || '').trim() || '(không mã)') + (l.size ? ' ' + l.size : '');
      if (!cm || !(cm.v.L > 0 && cm.v.W > 0 && cm.v.H > 0)) { // PC 8.71: chưa có kích thước → VẪN đưa vào phương án với kích thước TẠM (mặc định của ô thêm hàng) để bạn mở ra sửa trực tiếp, rồi "Lưu danh mục"
        if (missing.indexOf(label) < 0) missing.push(label);
        const code0 = String(l.ma || '').trim(), k0 = nk(code0) + '|' + nk(l.size) + '|' + String(l.nsx || ''), o0 = merged.get(k0);
        if (o0) { o0.qty += qty; return; }
        merged.set(k0, newSku({ code: code0, size: String(l.size || '').trim(), name: String(l.ten || ''), date: String(l.nsx || ''), qty, kg: num(l.ton) > 0 && num(l.kg) > 0 ? num(l.kg) / num(l.ton) : 10, note: 'CHƯA CÓ KÍCH THƯỚC THÙNG — đang dùng số tạm, hãy nhập đúng rồi bấm “Lưu danh mục”' }));
        return;
      }
      if (!cm.exact) warn.push('“' + label + '” chưa có đúng size trong danh mục — tạm dùng kích thước của “' + catLabel(cm.v) + '”');
      const code = String(cm.v.code || l.ma || '').trim(), k = nk(code) + '|' + nk(l.size) + '|' + String(l.nsx || ''), kgEach = num(cm.v.kg) > 0 ? num(cm.v.kg) : (num(l.ton) > 0 ? num(l.kg) / num(l.ton) : 0);
      const o = merged.get(k); if (o) { o.qty += qty; return; }
      merged.set(k, newSku(Object.assign({}, clone(cm.v), { code, size: String(l.size || '').trim(), name: String(l.ten || cm.v.name || ''), date: String(l.nsx || ''), qty, kg: kgEach })));
    });
    if ((g.lack || []).length) warn.push('Thiếu tồn so với số cần xuất: ' + g.lack.join(', '));
    return { skus: Array.from(merged.values()), missing, warn };
  }
  const contCap = (c) => c.L * c.W * Math.min(c.H, c.redLine > 0 ? c.redLine : c.H);
  function autoPick(skus, opts) { // cont NHỎ NHẤT vừa đủ; không có cont nào vừa → cont lớn nhất (kèm cảnh báo)
    const conts = contList().filter((c) => c.L > 0 && c.W > 0 && c.H > 0).sort((a, b) => contCap(a) - contCap(b));
    const boxVol = skus.reduce((a, k) => a + k.L * k.W * k.H * k.qty, 0), totKg = skus.reduce((a, k) => a + k.kg * k.qty, 0);
    let best = null;
    for (const c of conts) {
      if (boxVol > contCap(c) || (c.maxPayload > 0 && totKg > c.maxPayload)) continue; // chắc chắn không vừa → bỏ qua cho nhanh
      let plan; try { plan = E.solve({ container: c, skus: clone(skus) }, opts); } catch (e) { continue; }
      const ok = plan.verify.ok && !plan.errors.length && plan.totals.left === 0;
      if (ok) return { cont: c, plan, fit: true, auto: true };
      if (!best || plan.totals.loaded > best.plan.totals.loaded) best = { cont: c, plan, fit: false, auto: true };
    }
    const big = conts[conts.length - 1]; if (!big) return null;
    if (!best || best.cont.id !== big.id) { try { const plan = E.solve({ container: big, skus: clone(skus) }, opts); if (!best || plan.totals.loaded >= best.plan.totals.loaded) best = { cont: big, plan, fit: plan.totals.left === 0 && plan.verify.ok, auto: true }; } catch (e) { /* giữ best */ } }
    return best;
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function autoRun(groups, opt) {
    if (!S.user.canWrite) throw new Error('Tài khoản chỉ xem — không lưu được phương án tự động.');
    await booted;
    const res = { created: 0, updated: 0, removed: 0, same: 0, locked: 0, noData: 0, warnings: [] }, keys = new Set(), now = new Date().toISOString(); let dirty = false;
    for (const g of groups) {
      const key = String(g.key); keys.add(key);
      const id = 'lx_' + hash(key), idx = S.plans.findIndex((p) => p.id === id), old = idx >= 0 ? S.plans[idx] : null;
      if (old && old.data && old.data.auto && old.data.auto.lock) { res.locked++; continue; }
      const b = autoBuild(g);
      if (!b.skus.length) { // không có hàng mô phỏng được (chưa dò tồn / thiếu kích thước): xoá phương án tự động cũ (nếu có) để khỏi sai lệch, giữ cảnh báo
        if (old) { S.plans.splice(idx, 1); dirty = true; res.removed++; }
        res.noData++; if (b.missing.length) res.warnings.push('Cont ' + autoDmy(g.ngay) + ' · ' + (g.lsx || []).join('+') + ': chưa có kích thước thùng cho ' + b.missing.join(', ')); continue;
      }
      const sig = hash(JSON.stringify([b.skus.map((k) => [k.code, k.size, k.date, k.qty, Math.round(k.L), Math.round(k.W), Math.round(k.H), k.kg, k.orient || '', k.allowLay, k.allowStand, k.allowRotate]), b.missing, contList().map((c) => [c.id, c.L, c.W, c.H, c.maxPayload, c.redLine]), S.opts.sampleOn, S.opts.sampleQty]));
      if (old && old.data && old.data.auto && old.data.auto.sig === sig) { res.same++; continue; }
      const opts = AUTO_OPTS(), pk = autoPick(b.skus, opts); if (!pk) continue; await tick();
      const t = pk.plan.totals, warn = b.warn.slice();
      if (!pk.fit) warn.unshift('KHÔNG VỪA: ' + (t.left ? 'rớt ' + fmt(t.left) + ' thùng' : 'phương án chưa hợp lệ') + ' với cont lớn nhất (' + pk.cont.name + ')');
      if (b.missing.length) warn.unshift(b.missing.length + ' mã chưa có kích thước thùng — đang dùng kích thước TẠM, kết quả chưa đáng tin: ' + b.missing.join(', '));
      const lsxTxt = (g.lsx || []).join('+') || '—', nm = 'LX ' + autoDmy(g.ngay) + ' · ' + lsxTxt + (g.khach ? ' · ' + String(g.khach).split(' · ')[0] : '');
      const rec = { id, name: nm, capNhat: now, contName: pk.cont.name + ' (tự chọn)', loaded: t.loaded, requested: t.requested,
        data: { cont: clone(pk.cont), cid: pk.cont.id, skus: b.skus, opts, colors: {}, unit: 'mm', auto: { key, ngay: g.ngay, lsx: g.lsx || [], rowIds: g.rowIds || [], sig, lock: false, warn, missing: b.missing, fit: !!pk.fit, at: now } } };
      delete rec.data.cont.builtin; delete rec.data.cont.edited;
      if (old) { S.plans[idx] = rec; res.updated++; } else { S.plans.unshift(rec); res.created++; } dirty = true;
      if (warn.length) res.warnings.push(nm + ': ' + warn.join('; '));
    }
    if (opt && opt.full) { // đối soát đầy đủ: bỏ phương án tự động (chưa khóa) của lịch đã xoá / đổi LSX / ngày, hoặc đã qua > 14 ngày
      const lim = new Date(Date.now() - 14 * 864e5), lk = lim.getFullYear() + '-' + String(lim.getMonth() + 1).padStart(2, '0') + '-' + String(lim.getDate()).padStart(2, '0');
      const keep = S.plans.filter((p) => { const a = p.data && p.data.auto; if (!a || a.lock) return true; return keys.has(a.key) && a.ngay >= lk; });
      if (keep.length !== S.plans.length) { res.removed += S.plans.length - keep.length; S.plans = keep; dirty = true; }
    }
    if (opt && opt.full) Object.keys(S.autoMiss).forEach((k) => { if (!keys.has(k)) delete S.autoMiss[k]; });
    scheduleSave(); paintOpenBtn();
    if (dirty) { await persistPlans(); autoPushSoon(); }
    return res;
  }
  let pushT = 0;
  function autoPushSoon() { // đẩy lên điện thoại (êm, không báo lỗi) sau khi tính xong
    clearTimeout(pushT); pushT = setTimeout(() => { try { if (window.sheetsSyncAPI && window.sheetsSyncAPI.pushModule) window.sheetsSyncAPI.pushModule('module14').catch(() => {}); } catch (e) { /* bỏ qua */ } }, 15000);
  }
  let autoChain = Promise.resolve();
  window.addEventListener('message', (ev) => { // CHỈ nhận từ trang chính
    const d = ev.data; if (!d || window.parent === window || ev.source !== window.parent) return;
    if (d.type === 'kla-c3d-ping') { if (S.loaded) ev.source.postMessage({ type: 'kla-c3d-pong', id: d.id }, '*'); return; }
    if (d.type !== 'kla-c3d-auto') return;
    const run = () => autoRun(Array.isArray(d.groups) ? d.groups : [], { full: !!d.full }), p = autoChain.then(run, run); autoChain = p.catch(() => {});
    p.then((res) => ev.source.postMessage({ type: 'kla-c3d-res', id: d.id, ok: true, res }, '*'), (e) => ev.source.postMessage({ type: 'kla-c3d-res', id: d.id, ok: false, error: String((e && e.message) || e) }, '*'));
  });

  // ------------------------------------------------------------------ khởi động
  async function boot() {
    try { const r = await window.authAPI.state(); if (r && r.ok && r.user) S.user = { canWrite: !!r.user.canWrite, canExport: !!r.user.canExport, ten: r.user.tenHienThi || r.user.ten }; } catch (e) { /* mở ngoài app: để mặc định */ }
    await loadAll();
    if (!S.cont) pickContainer(S.cid); else { const base = contList().find((x) => x.id === S.cid); if (!base) { S.cid = 'rf40hc'; } }
    if (!S.cont || !(S.cont.L > 0)) pickContainer('rf40hc');
    S.loaded = true; bootOk();
    $('c3dSave').disabled = !S.user.canWrite; $('c3dSave').title = S.user.canWrite ? $('c3dSave').title : 'Tài khoản chỉ xem — không lưu được';
    $('c3dExcel').disabled = !S.user.canExport; $('c3dPng').disabled = !S.user.canExport;
    const side = $('c3dSide'); side.addEventListener('input', onSideInput); side.addEventListener('change', onSideChange); side.addEventListener('click', onSideClick);
    $('c3dReport').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hint]'); if (!b || !S.plan) return; const h = (S.plan.hints || [])[+b.dataset.hint]; if (!h) return;
      Object.keys(h.patch.skus || {}).forEach((id) => { const k = S.skus.find((x) => x.id === id); if (k) Object.assign(k, clone(h.patch.skus[id])); });
      Object.assign(S.cont, h.patch.container || {}); Object.assign(S.opts, h.patch.opts || {}); renderSide(); calc(); scheduleSave(); toast('Đã áp dụng gợi ý: ' + h.text);
    });
    ['click', 'input', 'change'].forEach((ev) => { $('c3dDlg').addEventListener(ev, onTpl); $('c3dDlg').addEventListener(ev, onCat); });
    $('c3dModal').addEventListener('click', (e) => { if (e.target === $('c3dModal')) closeModal(); onDlgClick(e); });
    $('c3dCalc').onclick = () => calc(); $('c3dSave').onclick = savePlanDialog; $('c3dOpen').onclick = openPlans; $('c3dExcel').onclick = exportExcel; $('c3dPng').onclick = exportPng; $('c3dPush').onclick = pushPhone;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    bindView(); renderSide();
    try {
      S.view = window.C3DView.create($('c3dVp')); S.view.onHover = onHover; S.view.onPick = onPick; S.view.onWalls = syncWallBoxes; S.view.onRowPick = (r) => { S.selRow = r; renderLayers(); }; syncWallBoxes(S.view.opt.walls);
      const light = () => document.documentElement.getAttribute('data-theme') === 'light'; S.view.setLight(light());
      new MutationObserver(() => { S.view.setLight(light()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (err) { console.error(err); $('c3dVp').innerHTML = '<div class="c3d-empty">Không dựng được khung 3D (WebGL): ' + esc(err.message || err) + '</div>'; }
    calc();
  }
  boot();
})();
