(function(){
  'use strict';
  var stage=document.getElementById('stage'), load=document.getElementById('load'), frames={}, cur='';
  function theme(){ return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'; }
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme',t);
    try{ localStorage.setItem('kla_theme',t); }catch(e){}
    document.getElementById('theme').textContent='Giao diện: '+(t==='dark'?'Tối':'Sáng');
    Object.keys(frames).forEach(function(k){ try{ frames[k].contentWindow.postMessage({type:'kla-theme-change',theme:t},'*'); }catch(e){} });
  }
  function open(name){
    if(cur===name) return; cur=name;
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
  document.getElementById('t-scan').onclick=function(){ open('scan'); };
  document.getElementById('t-c3d').onclick=function(){ open('c3d'); };
  document.getElementById('theme').onclick=function(){ applyTheme(theme()==='dark'?'light':'dark'); };
  var t0='light'; try{ t0=localStorage.getItem('kla_theme')==='dark'?'dark':'light'; }catch(e){}
  applyTheme(t0);
  open('scan');
})();
