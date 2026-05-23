// Helper de debug CDP — conecta no WebView da TCL e avalia JS.
// Uso: node _cdp_debug.mjs "<expressao js>"
// Ferramenta temporaria de debug — remover antes de finalizar.
import WebSocket from 'ws';

const PORT = process.env.CDP_PORT || '9333';
const expr = process.argv[2] || 'document.title';

const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
if (!page) {
  console.error('Nenhuma pagina debugavel encontrada');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

ws.on('open', async () => {
  await send('Runtime.enable');
  const res = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
    allowUnsafeEvalBlockedByCSP: true,
  });
  if (res.result?.exceptionDetails) {
    console.log('EXCEPTION: ' + JSON.stringify(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails));
  } else {
    console.log(JSON.stringify(res.result?.result?.value ?? res.result?.result?.description ?? null));
  }
  ws.close();
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('WS erro: ' + e.message);
  process.exit(1);
});
