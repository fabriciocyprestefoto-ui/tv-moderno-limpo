const expr = `(function(){
  var btns = Array.from(document.querySelectorAll('button, [role="button"], [tabindex]'));
  var sbt = btns.find(function(b){ return /SBT/i.test(b.textContent) && /Ao Vivo/i.test(b.textContent); });
  if (!sbt) return JSON.stringify({err: 'sbt button not found', btnsLen: btns.length});
  var rect = sbt.getBoundingClientRect();
  // Try focus + Enter
  sbt.focus();
  var evDown = new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true});
  var evUp = new KeyboardEvent('keyup', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true});
  sbt.dispatchEvent(evDown);
  sbt.dispatchEvent(evUp);
  sbt.click();
  return JSON.stringify({clicked:true, text:sbt.textContent.slice(0,80), rect: {x:rect.x, y:rect.y, w:rect.width, h:rect.height}});
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
