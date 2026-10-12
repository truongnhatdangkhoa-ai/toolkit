
(function(){
  'use strict';
  var tEl = document.getElementById('scanToast'), tT = 0;
  function toast(msg, bad){ tEl.textContent = msg; tEl.className = 'scan-toast' + (bad ? ' bad' : ''); tEl.hidden = false; clearTimeout(tT); tT = setTimeout(function(){ tEl.hidden = true; }, bad ? 7000 : 4500); }
  // Lưu = tải xuống → Electron mở hộp thoại "Lưu thành…" (và Lịch sử thao tác ghi "Xuất file" khi lưu xong).
  function save(blob, name){
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve('chọn nơi lưu trong hộp thoại vừa mở');
  }
  KLScanUI.mount(document.getElementById('scanRoot'), {
    platform: 'pc', camera: true, maxPdfPages: 200, toast: toast, save: save, doneWord: 'Đã tạo',
    ensure: function(name){ return klNap(name === 'pdfjs' ? 'pdfjs' : name === 'jszip' ? 'jszip' : 'jspdf'); }
  });
})();
