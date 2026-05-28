const expr = `(function(){
  var v = document.querySelector('video');
  var Cap = window.Capacitor;
  var isNative = Cap && typeof Cap.isNativePlatform === 'function' ? Cap.isNativePlatform() : !!Cap;
  return JSON.stringify({
    hasCapacitor: !!Cap,
    isNativePlatform: isNative,
    importMetaEnvBuild: window.__VITE_TV_BUILD__ || null,
    userAgent: navigator.userAgent.slice(0, 200),
    isTV: !!document.documentElement.classList.contains('tv-box') || /TV|Smart/.test(navigator.userAgent),
    videoElement: v ? { src: v.src||v.currentSrc, readyState:v.readyState, networkState:v.networkState, error:v.error?v.error.code:null, paused:v.paused } : null,
    hasHls: typeof window.Hls !== 'undefined' || !!document.querySelector('script[src*="hls"]'),
    docDataPage: document.documentElement.getAttribute('data-page'),
    docDataRedxApp: document.documentElement.getAttribute('data-redx-app'),
    spinnerCount: document.querySelectorAll('.animate-spin, [aria-busy]').length,
    androidBridge: !!window.RedxAndroidBridge,
    androidPlayer: !!(window.Android && window.Android.openPlayer),
    nativePlayerPlugin: !!(Cap && Cap.Plugins && Cap.Plugins.NativePlayer)
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
