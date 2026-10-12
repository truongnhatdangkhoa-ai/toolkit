
/* Bản đứng riêng (1 file HTML): thay cầu Electron bằng bộ nhớ trình duyệt. */
(function(){
  var mem={}; function key(db,n){return 'kl_standalone_'+db+'_'+n;}
  function get(k){ try{ var v=localStorage.getItem(k); if(v!=null) return JSON.parse(v);}catch(e){} return mem[k]||null; }
  function set(k,v){ mem[k]=v; try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ window.__klStoreWarn=1; } }
  window.dbAPI={
    readSheet:function(db,n){ return Promise.resolve({ok:true,data:get(key(db,n))||[]}); },
    writeSheets:function(db,o){ Object.keys(o||{}).forEach(function(n){ set(key(db,n),o[n]); }); return Promise.resolve({ok:true}); }
  };
  window.authAPI={ state:function(){ return Promise.resolve({ok:true,user:{canWrite:true,canExport:true,ten:'Bạn'}}); } };
})();
