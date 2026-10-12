(function(){
  'use strict';
  var stage=document.getElementById('stage'), load=document.getElementById('load'), frames={}, cur='';
  function theme(){ return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'; }
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme',t);
    try{ localStorage.setItem('kla_theme',t); }catch(e){}
    var tl='Giao diện: '+(t==='dark'?'Tối':'Sáng'); document.getElementById('theme').textContent=tl; document.getElementById('theme2').textContent=tl;
    Object.keys(frames).forEach(function(k){ try{ frames[k].contentWindow.postMessage({type:'kla-theme-change',theme:t},'*'); }catch(e){} });
  }
  var home=document.getElementById('home');
  function open(name){
    if(cur===name) return; cur=name; home.hidden=true;
    ['scan','c3d'].forEach(function(n){
      var on=n===name; document.getElementById('t-'+n).setAttribute('aria-selected',on?'true':'false');
      if(frames[n]) frames[n].classList.toggle('on',on);
    });
    if(!frames[name]){
      load.style.display='flex'; load.textContent='Đang tải…';
      setTimeout(function(){
        var f=document.createElement('iframe'); f.setAttribute('allow','camera; clipboard-read; clipboard-write; fullscreen');
        f.title=name==='scan'?'Scan tài liệu':'Container 3D';
        f.addEventListener('load',function(){ load.style.display='none'; });
        f.src=name==='scan'?'apps/scan/index.html':'apps/c3d/index.html'; stage.appendChild(f); frames[name]=f; f.classList.toggle('on',cur===name);
      },20);
    } else load.style.display='none';
  }
  // ---- ẩn thanh menu trong app Android (điện thoại/máy tính bảng); nút nhỏ ở mép trên để mở lại ----
  var body=document.body, scrim=document.getElementById('barScrim'), handle=document.getElementById('barHandle');
  var native=false; try{ native=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()); }catch(e){}
  if(native||/[?&]bar=hide\b/.test(location.search)) body.classList.add('autohide');
  function bar(on){
    body.classList.toggle('bar-open',on); scrim.hidden=!on; handle.setAttribute('aria-expanded',on?'true':'false');
  }
  handle.onclick=function(){ bar(true); };
  scrim.onclick=function(){ bar(false); };
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') bar(false); });
  document.getElementById('t-scan').onclick=function(){ open('scan'); bar(false); };
  document.getElementById('t-c3d').onclick=function(){ open('c3d'); bar(false); };
  document.getElementById('theme').onclick=function(){ applyTheme(theme()==='dark'?'light':'dark'); bar(false); };
  var t0='light'; try{ t0=localStorage.getItem('kla_theme')==='dark'?'dark':'light'; }catch(e){}
  applyTheme(t0);
  document.getElementById('theme2').onclick=function(){ applyTheme(theme()==='dark'?'light':'dark'); };
  document.getElementById('h-scan').onclick=function(){ open('scan'); pushMod(); };
  document.getElementById('h-c3d').onclick=function(){ open('c3d'); pushMod(); };
  function goHome(){
    cur=''; home.hidden=false; load.style.display='none'; bar(false);
    ['scan','c3d'].forEach(function(n){ document.getElementById('t-'+n).setAttribute('aria-selected','false'); if(frames[n]) frames[n].classList.remove('on'); });
  }
  var hasHome=body.classList.contains('autohide');
  function pushMod(){ if(!native&&hasHome){ try{ history.pushState({m:1},''); }catch(e){} } }
  if(hasHome){
    // nút Back của điện thoại: đang ở công cụ → về màn hình chính; đang ở màn hình chính → thoát app
    try{ var AP=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
      if(native&&AP&&AP.addListener) AP.addListener('backButton',function(){ if(cur) goHome(); else if(AP.exitApp) AP.exitApp(); }); }catch(e){}
    window.addEventListener('popstate',function(){ if(cur) goHome(); });   // trình duyệt: nút Back
    goHome();
  } else open('scan');
})();
