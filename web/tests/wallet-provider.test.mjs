import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Execute Wallet's actual effect with controlled hook inputs. Browser reloads are
// covered separately; these tests force provider failures and late completions.
const source = await readFile(new URL('../src/Wallet.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} });
const require = createRequire(import.meta.url);
const provider = { request: async () => '0xaa36a7' };
const flush = () => new Promise(resolve => setImmediate(resolve));

function mount(connection) {
  const values = [false, '', false];
  let stateIndex = 0; let effect; let fallback = provider;
  const runtime = { chain: { id: 11155111 }, setWalletProvider: value => { fallback = value; } };
  const mocks = {
    react: { useEffect: callback => { effect = callback; }, useState: initial => {
      const index = stateIndex++; values[index] = initial;
      return [initial, value => { values[index] = value; }];
    } },
    wagmi: { useConnection: () => connection, useConnect: () => ({ connectors: [] }), useDisconnect: () => ({}) },
    './context': { useRuntime: () => runtime },
    './ui': {}, './utils': { shortAddress: address => address },
    './open-in': { isMobileBrowser: () => false, OPEN_IN: [] },
  };
  const exports = {};
  new Function('require', 'exports', outputText)(name => mocks[name] ?? require(name), exports);
  exports.Wallet();
  const cleanup = effect();
  return { cleanup, fallback: () => fallback, error: () => values[1] };
}

test('wallet fallback is cleared during reconnection, including serialized connectors', async () => {
  let calls = 0;
  for (const connector of [{ id: 'persisted' }, { getProvider: async () => { calls++; return provider; } }]) {
    const mounted = mount({ status: 'reconnecting', isConnected: true, chainId: 11155111, connector });
    await flush();
    assert.equal(mounted.fallback(), undefined);
    assert.equal(calls, 0);
    mounted.cleanup();
  }
});

test('only a connected, resolved connector on the configured chain supplies fallback reads', async () => {
  let calls = 0;
  const connector = { getProvider: async () => { calls++; return provider; } };
  for (const connection of [
    { status: 'disconnected', isConnected: false },
    { status: 'connecting', isConnected: false, connector },
    { status: 'connected', isConnected: true, chainId: 1, connector },
    { status: 'connected', isConnected: true, chainId: 11155111, connector: { id: 'persisted' } },
  ]) {
    const mounted = mount(connection); await flush();
    assert.equal(mounted.fallback(), undefined); mounted.cleanup();
  }
  assert.equal(calls, 0);
  const mounted = mount({ status: 'connected', isConnected: true, chainId: 11155111, connector });
  await flush(); assert.equal(mounted.fallback(), provider); assert.equal(calls, 1);
  mounted.cleanup(); assert.equal(mounted.fallback(), undefined);
});

test('synchronous provider failures and rejected promises leave a recoverable wallet error', async () => {
  for (const getProvider of [() => { throw new Error('Provider failed'); }, async () => { throw new Error('Provider rejected'); }]) {
    const mounted = mount({ status: 'connected', isConnected: true, chainId: 11155111, connector: { getProvider } });
    await flush();
    assert.equal(mounted.fallback(), undefined);
    assert.match(mounted.error(), /Disconnect and reconnect/);
    mounted.cleanup();
  }
});

test('cleanup ignores both late provider resolutions and late failures', async () => {
  for (const fail of [false, true]) {
    let resolve; let reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    const mounted = mount({ status: 'connected', isConnected: true, chainId: 11155111, connector: { getProvider: () => pending } });
    mounted.cleanup();
    if (fail) reject(new Error('Late failure')); else resolve(provider);
    await flush();
    assert.equal(mounted.fallback(), undefined);
    assert.equal(mounted.error(), '');
  }
});
