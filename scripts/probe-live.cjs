const expr = `(function(){
  var area=document.querySelector('.live-player-area');
  var allChans=document.querySelectorAll('[data-nav-channel-item],[data-channel-item]');
  var selected=document.querySelector('[data-selected="true"],[aria-selected="true"]');
  var spinners=document.querySelectorAll('.spinner, [data-loading], [aria-busy="true"], .animate-spin');
  return JSON.stringify({
    hasArea: !!area,
    areaInnerHTMLLen: area?area.innerHTML.length:0,
    areaSnippet: area?area.innerHTML.slice(0,300):null,
    videoCount: document.querySelectorAll('video').length,
    iframeCount: document.querySelectorAll('iframe').length,
    chanCount: allChans.length,
    selectedExists: !!selected,
    spinnerCount: spinners.length,
    pathname: window.location.pathname,
    bodyTextSlice: document.body.textContent.replace(/\\s+/g,' ').slice(0,400)
  });
})()`;
const http=require('http'),WebSocket=require('ws');
http.get('http://127.0.0.1:9333/json/list',(res)=>{
  let b='';res.on('data',(c)=>b+=c);res.on('end',()=>{
    const pages=JSON.parse(b);const p=pages.find(x=>x.type==='page');
    const ws=new WebSocket(p.webSocketDebuggerUrl);
    ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}})));
    ws.on('message',(d)=>{const m=JSON.parse(d.toString());if(m.id===1){console.log(m.result?.result?.value||JSON.stringify(m));ws.close();}});
  });
});
