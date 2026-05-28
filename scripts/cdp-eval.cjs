#!/usr/bin/env node
// Helper para Eval JS em WebView via CDP (Chrome DevTools Protocol).
// Uso: node scripts/cdp-eval.cjs "<expr JS>"
//      node scripts/cdp-eval.cjs --nav /canais

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.CDP_PORT || 9333;

function listPages() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function evalExpr(expr) {
  const pages = await listPages();
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('no page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise: true },
      }));
    });
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.id === 1) {
        ws.close();
        if (msg.result?.result?.value !== undefined) resolve(msg.result.result.value);
        else resolve(JSON.stringify(msg.result || msg));
      }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 8000);
  });
}

(async () => {
  const arg = process.argv[2];
  let expr = arg;
  if (arg === '--nav') {
    const path = process.argv[3] || '/';
    expr = `(function(){ window.location.assign(${JSON.stringify(path)}); return 'navigating to ${path}'; })()`;
  }
  if (!expr) { console.error('usage: cdp-eval.cjs <expr>'); process.exit(1); }
  try {
    const v = await evalExpr(expr);
    console.log(typeof v === 'object' ? JSON.stringify(v) : v);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exit(1);
  }
})();
