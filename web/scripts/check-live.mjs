import { createPublicClient, http, keccak256, parseAbi, encodeAbiParameters } from 'viem';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, dist, readJson, validate } from './integrity.mjs';
await validate();
const manifest = await readJson(resolve(dist, 'imd-deployment.json'));
const contracts = Object.fromEntries(await Promise.all(manifest.contracts.map(async c => [c.name, { address: c.address, abi: await readJson(resolve(dist, c.abiPath)) }])));
const result = { checkedAt: new Date().toISOString(), publicRpc: null, chainId: manifest.chainId, blockNumber: null, contracts: [], factory: null, collectionImplementation: null, pool: null, attempts: [], broadcasts: 0 };
let client;
for (const rpc of manifest.network.rpcUrls) {
  const c = createPublicClient({ transport: http(rpc, { timeout: 15000, retryCount: 0, fetchOptions: { headers: { 'User-Agent': 'Loom frontend read-only validation' } } }) });
  try { const id = await c.getChainId(); if (id !== manifest.chainId) throw new Error(`Wrong chain: ${id}`); client = c; result.publicRpc = rpc; break; }
  catch (e) { result.attempts.push({ url: rpc, error: e.shortMessage ?? e.message }); }
}
if (!client) throw new Error('No configured public RPC answered with the expected chain ID.');
const block = await client.getBlockNumber(); result.blockNumber = block.toString();
for (const c of manifest.contracts) { const code = await client.getCode({ address: c.address, blockNumber: block }); if (!code || code === '0x') throw new Error(`No code at ${c.name}`); result.contracts.push({ name: c.name, address: c.address, byteLength: (code.length - 2) / 2, runtimeKeccak: keccak256(code), abiHash: c.abiHash }); }
async function reads(contract, functions) { return Object.fromEntries(await Promise.all(functions.map(async functionName => [functionName, await client.readContract({ ...contract, functionName, blockNumber: block })]))); }
result.factory = await reads(contracts.LoomFactory, ['CREATE_FEE','paused','collectionCount','implementation','pauser','PLATFORM']);
if (result.factory.implementation.toLowerCase() !== contracts.LoomCollection.address.toLowerCase()) throw new Error('Factory implementation mismatch.');
result.collectionImplementation = await reads(contracts.LoomCollection, ['PLATFORM_FEE','CREATOR_FEE_SHARE','PLATFORM_FEE_SHARE','RESERVE_FEE_SHARE','PLATFORM','RESERVE']);
result.token = await reads(contracts.LaunchToken, ['name','symbol','decimals','totalSupply']);
if (manifest.poolKey) {
  const pool = manifest.poolKey;
  const id = keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}], [pool.currency0,pool.currency1,pool.fee,pool.tickSpacing,pool.hooks]));
  const abi = parseAbi(['function getLiquidity(bytes32 poolId) view returns (uint128)', 'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)']);
  try {
    const liquidity = await client.readContract({ address: manifest.network.uniswapV4.stateView, abi, functionName:'getLiquidity', args:[id], blockNumber:block });
    const slot0 = await client.readContract({ address: manifest.network.uniswapV4.stateView, abi, functionName:'getSlot0', args:[id], blockNumber:block });
    result.pool = { id, liquidity, sqrtPriceX96: slot0[0], tick: slot0[1], protocolFee: slot0[2], lpFee: slot0[3] };
  } catch (e) { result.pool = { id, error: e.shortMessage ?? e.message }; }
}
const text = JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
await writeFile(resolve(root, 'docs/frontend-evidence/live-read.json'), text); console.log(text);
