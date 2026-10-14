// Regression tests for the reviewed reload crash and receipt-check resubmission.
// Runs against the real static export, with the existing test-only wallet/RPC.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { parseEther } from 'viem';
import { serve } from '../scripts/serve.mjs';
import { root, dist, sha256 } from '../scripts/integrity.mjs';
import { makeMock, attachMock, clone, manifest } from './mock-chain.mjs';

const baseline = process.argv.includes('--baseline');
const evidence = resolve(root, 'docs/frontend-evidence');
await mkdir(evidence, { recursive: true });
const report = {
  mode: baseline ? 'reproduce reported defects before repair' : 'regression after repair',
  startedAt: new Date().toISOString(),
  manifestSha256: sha256(await readFile(resolve(dist, 'imd-deployment.json'))),
  viewport: { width: 390, height: 844 },
  testMode: 'Mocked EIP-6963 wallet and RPC; no real signatures or broadcasts',
  browsers: [], checks: [],
};
const server = await serve(0);
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const until = async (fn, message, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
};
const check = async (name, run) => {
  try {
    const observed = await run();
    report.checks.push({ name, passed: true, observed });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};
async function connect(page, mock) {
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Test wallet', exact: true }).click();
  await until(() => mock.state.walletChain === manifest.chainId, 'Wallet did not switch');
  await until(async () => (await page.locator('.wallet-button').innerText()).startsWith('0x'), 'Wallet did not connect');
  await page.waitForFunction(() => localStorage.getItem('wagmi.store')?.includes('test.loom.wallet'));
}
async function fixture(browser, route, setup = () => {}) {
  const context = await browser.newContext({ viewport: report.viewport, reducedMotion: 'reduce' });
  const mock = makeMock(); setup(mock);
  await attachMock(context, mock);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${url}#${route}`);
  await connect(page, mock);
  return { context, page, mock, errors };
}

try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    report.browsers.push({ name, version: browser.version() });
    try {
      for (const route of ['/', '/create', `/collection/${clone}`, '/tokens', '/trade']) {
        await check(`${name}: authorized wallet reload ${route}`, async () => {
          const { context, page, mock, errors } = await fixture(browser, route, mock => { mock.state.created = true; });
          try {
            const persisted = await page.evaluate(() => localStorage.getItem('wagmi.store'));
            assert.ok(persisted.includes('test.loom.wallet'));
            await page.reload();
            if (baseline) {
              await until(() => errors.some(e => /getProvider.*not a function/i.test(e)), 'Reported reload exception did not reproduce');
              await page.waitForFunction(() => document.getElementById('root').childElementCount === 0);
              assert.equal(await page.locator('body').innerText(), '');
            } else {
              await page.locator('main h1').waitFor();
              await page.locator('.wallet-button').click();
              await page.getByRole('dialog', { name: 'Your wallet', exact: true }).waitFor();
              await page.getByText('Connected to Sepolia.', { exact: true }).waitFor();
              await page.keyboard.press('Escape');
              assert.ok((await page.locator('body').innerText()).length > 0);
              assert.deepEqual(errors, []);
              for (const width of [320, 390]) {
                await page.setViewportSize({ width, height: 844 });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
              }
              if (route === '/') await page.screenshot({ path: resolve(evidence, `${name}-reload-390.png`) });
            }
            assert.equal(mock.state.sent.length, 0);
            return { errors, bodyTextLength: (await page.locator('body').innerText()).length,
              rootChildren: await page.locator('#root').evaluate(el => el.childElementCount), walletAuthorized: mock.state.connected,
              signedTransactions: mock.state.sent.length };
          } finally { await context.close(); }
        });
      }
      for (const action of ['create', 'mint']) {
        await check(`${name}: ${action} receipt check never resubmits the form`, async () => {
          const { context, page, mock, errors } = await fixture(browser, action === 'create' ? '/create' : `/collection/${clone}`, mock => {
            mock.state.created = action === 'mint'; mock.state.price = parseEther('0.001');
          });
          try {
            if (action === 'create') {
              await page.getByLabel('Collection name', { exact: true }).fill('Timeout test');
              await page.getByLabel('Symbol', { exact: true }).fill('TIME');
            }
            const submit = page.getByRole('button', { name: action === 'create' ? 'Create collection' : 'Mint tokens', exact: true });
            await until(async () => await submit.isEnabled(), 'Paid action did not enable');
            await page.clock.install();
            mock.state.holdReceipt = true;
            await submit.click();
            await page.locator('form .transaction-status').getByText('Waiting for confirmation…', { exact: false }).waitFor();
            assert.equal(mock.state.sent.length, 1);
            await page.clock.fastForward(121000);
            await page.locator('form .transaction-status').getByText('Confirmation not yet known', { exact: false }).waitFor();
            const receiptCheck = page.locator('form').getByRole('button', { name: 'Check confirmation', exact: true });
            const buttonType = await receiptCheck.evaluate(el => el.type);
            mock.state.holdReceipt = false;
            await receiptCheck.click();
            if (baseline) await until(() => mock.state.sent.length === 2, 'Reported duplicate transaction did not reproduce');
            else {
              await page.locator('form .transaction-status').getByText(/: Confirmed$/).waitFor();
              // Let the old asynchronous submit path (reads + simulation) finish if it was started.
              await page.waitForTimeout(1500);
              assert.equal(buttonType, 'button');
              assert.equal(mock.state.sent.length, 1);
              if (action === 'mint') {
                await page.getByText('Token #1', { exact: true }).waitFor();
                assert.equal(mock.state.minted, 1n);
              }
            }
            const expectedValue = parseEther(action === 'create' ? '0.002' : '0.0015');
            for (const tx of mock.state.sent) {
              assert.equal(BigInt(tx.value), expectedValue);
              assert.equal(tx.decoded.functionName, action === 'create' ? 'createCollection' : 'mint');
            }
            assert.deepEqual(errors, []);
            return { buttonType, walletRequests: mock.state.sent.map(tx => ({ functionName: tx.decoded.functionName, value: tx.value })),
              minted: mock.state.minted.toString(), errors };
          } finally { await context.close(); }
        });
      }
    } finally { await browser.close(); }
  }
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(evidence, baseline ? 'revision-before.json' : 'revision-after.json'), JSON.stringify(report, null, 2) + '\n');
  server.close();
}
