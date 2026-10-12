(function(){var done={};
window.klNap=function(){var names=[].slice.call(arguments);
 names.forEach(function(n){ if(n==='pdfjs'&&!done.pdfjs&&window.pdfjsLib){ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc=new URL('js/vendor/pdf.worker.min.js',document.baseURI).href; done.pdfjs=1; }catch(e){} } });
 return Promise.resolve();};})();
