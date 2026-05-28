const expr = `(function(){
  var root = document.getElementById('root');
  var preboot = document.getElementById('preboot');
  return JSON.stringify({
    rootChildren: root ? root.children.length : -1,
    rootHTMLLen: root ? root.innerHTML.length : 0,
    rootSnippet: root ? root.innerHTML.replace(/<style>[\\s\\S]*?<\\/style>/g,'').slice(0,800) : null,
    prebootDisplay: preboot ? preboot.style.display : 'absent',
    docTitle: document.title,
    pathname: location.pathname,
    bodyChildren: document.body.children.length
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
