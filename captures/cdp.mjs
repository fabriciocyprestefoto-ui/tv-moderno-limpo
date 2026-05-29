const WS=`ws://127.0.0.1:9333/devtools/page/${process.env.CDP_PAGE}`;
const expr=process.argv[2];
const ws=new WebSocket(WS);
ws.onopen=()=>ws.send(JSON.stringify({id:2,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}}));
ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id===2){console.log(JSON.stringify(m.result?.result?.value??m.error??m.result));ws.close();process.exit(0);}};
ws.onerror=(e)=>{console.log('WSERR',e.message||e);process.exit(1);};
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},6000);
