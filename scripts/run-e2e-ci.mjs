import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const HOST = '127.0.0.1';
const START_PORT = Number(process.env.E2E_PORT || 4173);
const END_PORT = START_PORT + 40;
const BUILD_TIMEOUT_MS = Number(process.env.E2E_BUILD_TIMEOUT_MS || 8 * 60_000);
const CYPRESS_TIMEOUT_MS = Number(process.env.E2E_CYPRESS_TIMEOUT_MS || 12 * 60_000);
const PREVIEW_WAIT_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_WAIT_TIMEOUT_MS || 90_000);
const CYPRESS_BROWSER = String(process.env.E2E_CYPRESS_BROWSER || 'chrome').trim();
const CYPRESS_SPEC = String(
  process.env.E2E_CYPRESS_SPEC ||
    'cypress/e2e/smoke-basic.cy.ts,cypress/e2e/shell-navigation.cy.ts,cypress/e2e/minimum-tv-flow.cy.ts,cypress/e2e/dpad-navigation.cy.ts'
).trim();
const viteBin = path.resolve('node_modules/vite/bin/vite.js');
const cypressBin = path.resolve('node_modules/cypress/bin/cypress');

function nowLabel() {
  return new Date().toISOString();
}

function run(cmd, args, options = {}) {
  const { timeoutMs, name, env: customEnv, ...spawnOptions } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: customEnv ? { ...process.env, ...customEnv } : process.env,
      ...spawnOptions,
    });
    let timedOut = false;
    const timeoutId =
      timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            try {
              child.kill('SIGTERM');
            } catch {
              /* noop */
            }
            setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {
                /* noop */
              }
            }, 2000);
          }, timeoutMs)
        : null;

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) {
        reject(
          new Error(
            `${name || cmd} timed out after ${timeoutMs}ms (${cmd} ${args.join(' ')})`
          )
        );
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(' ')} failed with ${signal || code}`));
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function findFreePort() {
  for (let port = START_PORT; port <= END_PORT; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free E2E preview port found from ${START_PORT} to ${END_PORT}`);
}

function waitForServer(url, timeoutMs = 60_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if ((res.statusCode || 0) < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2_500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(poll, 500);
    };

    poll();
  });
}

async function main() {
  const port = await findFreePort();
  const baseUrl = `http://${HOST}:${port}`;

  console.log(`[${nowLabel()}] [e2e-ci] Building app in e2e mode...`);
  await run(process.execPath, [viteBin, 'build', '--mode', 'e2e'], {
    timeoutMs: BUILD_TIMEOUT_MS,
    name: 'vite-build-e2e',
    env: {
      VITE_E2E: process.env.VITE_E2E || '1',
      VITE_BUILD_CHANNEL: process.env.VITE_BUILD_CHANNEL || 'e2e',
      VITE_SKIP_AUTH: process.env.VITE_SKIP_AUTH || '1',
    },
  });

  console.log(`[${nowLabel()}] [e2e-ci] Starting Vite preview at ${baseUrl}...`);
  const preview = spawn(
    process.execPath,
    [viteBin, 'preview', '--mode', 'e2e', '--port', String(port), '--strictPort', '--host', HOST],
    { stdio: 'inherit' }
  );

  const stopPreview = () => {
    if (!preview.killed) preview.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
  };

  try {
    console.log(`[${nowLabel()}] [e2e-ci] Waiting for preview server...`);
    await waitForServer(baseUrl, PREVIEW_WAIT_TIMEOUT_MS);
    console.log(`[${nowLabel()}] [e2e-ci] Running Cypress against ${baseUrl}...`);
    await run(
      process.execPath,
      [
        cypressBin,
        'run',
        '--browser',
        CYPRESS_BROWSER,
        '--spec',
        CYPRESS_SPEC,
        '--config',
        `baseUrl=${baseUrl},screenshotOnRunFailure=false,video=false,numTestsKeptInMemory=0`,
        '--reporter',
        'mocha-junit-reporter',
        '--reporter-options',
        'mochaFile=cypress/results/e2e-junit.xml,toConsole=false',
      ],
      {
        timeoutMs: CYPRESS_TIMEOUT_MS,
        name: 'cypress-run-e2e',
      }
    );
  } finally {
    console.log(`[${nowLabel()}] [e2e-ci] Stopping preview server...`);
    stopPreview();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
