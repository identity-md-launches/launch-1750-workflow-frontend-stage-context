// Test-only simulated chain. No keys, signatures, or real transaction broadcasts.
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, encodeEventTopics, encodeAbiParameters, toHex, zeroAddress } from 'viem';
import { readJson, root, dist } from '../scripts/integrity.mjs';
import { resolve } from 'node:path';
import { quoterAbi, routerAbi, permit2Abi, stateViewAbi } from '../src/swap-protocol.ts';

export const account = '0x7efaa4fe311657ac972b6f1ce05a2ee460805fdf';
export const clone = '0x1234567890abcdef1234567890abcdef12345678';
export const other = '0x234567890abcdef1234567890abcdef123456789';
export const manifest = await readJson(resolve(dist, 'imd-deployment.json'));
export const appContracts = Object.fromEntries(await Promise.all(manifest.contracts.map(async c => [c.name, { ...c, abi: await readJson(resolve(dist, c.abiPath)) }])));
const protocol = manifest.network.uniswapV4;
const blockHash = `0x${'ab'.repeat(32)}`;
const zeroHash = `0x${'00'.repeat(32)}`;
const block = 12000000n;
const key = a => typeof a === 'string' ? a.toLowerCase() : undefined;
export function makeMock() {
  const state = {
    connected: false, walletChain: 1, knownChain: false, requests: [], sent: [], pending: new Map(), block,
    created: false, paused: false, factoryPaused: false, frozen: false, provenanceSet: false, revealSeedSet: false,
    name: 'Field notes', symbol: 'FIELD', maxSupply: 1000n, price: 0n, maxPerWallet: 3n, royalty: 500n,
    totalSupply: 0n, minted: 0n, reserveMinted: 0n, owner: account, creator: account, pendingOwner: zeroAddress,
    baseURI: '', unrevealedURI: '', provenanceHash: zeroHash, revealSeed: zeroHash, owners: new Map(),
    ercAllowance: 0n, permitAmount: 0n, permitExpiration: 0, liquidity: 1000000000000000n,
    nativeBalance: 100n * 10n ** 18n, tokenBalance: 1000n * 10n ** 18n,
    rejectConnect: false, rejectSend: false, revertSimulation: '', holdReceipt: false, rpcDown: false, missingCode: false,
  };
  const contractAt = to => {
    const addr = key(to);
    for (const c of Object.values(appContracts)) if (key(c.address) === addr) return { kind: c.name, abi: c.abi };
    if (addr === key(clone)) return { kind: 'clone', abi: appContracts.LoomCollection.abi };
    if (addr === key(protocol.quoter)) return { kind: 'quoter', abi: quoterAbi };
    if (addr === key(protocol.universalRouter)) return { kind: 'router', abi: routerAbi };
    if (addr === key(protocol.permit2)) return { kind: 'permit2', abi: permit2Abi };
    if (addr === key(protocol.stateView)) return { kind: 'stateView', abi: stateViewAbi };
    throw new Error(`Unexpected test address: ${to}`);
  };
  const decode = tx => { const c = contractAt(tx.to); return { ...c, ...decodeFunctionData({ abi: c.abi, data: tx.data }) }; };
  const rpcError = (message, code = -32000, data) => { const e = new Error(message); e.code = code; if (data) e.data = data; throw e; };
  const balance = address => [...state.owners.values()].filter(o => key(o) === key(address)).length;
  const apply = tx => {
    const { functionName: fn, args: a = [], kind } = decode(tx);
    if (fn === 'createCollection') { [state.name,state.symbol,state.maxSupply,state.price,state.maxPerWallet,state.creator,state.royalty] = a; state.created = true; }
    if (fn === 'mint' || fn === 'reserveMint') { for (let i = 0n; i < a[0]; i++) state.owners.set(++state.totalSupply, account); if (fn === 'mint') state.minted += a[0]; else state.reserveMinted += a[0]; }
    if (fn === 'pause') kind === 'LoomFactory' ? state.factoryPaused = true : state.paused = true;
    if (fn === 'unpause') kind === 'LoomFactory' ? state.factoryPaused = false : state.paused = false;
    if (fn === 'setBaseURI') state.baseURI = a[0];
    if (fn === 'setUnrevealedURI') state.unrevealedURI = a[0];
    if (fn === 'setProvenanceHash') { state.provenanceSet = true; state.provenanceHash = a[0]; }
    if (fn === 'setRevealSeed') { state.revealSeedSet = true; state.revealSeed = a[0]; }
    if (fn === 'freezeMetadata') state.frozen = true;
    if (fn === 'transferOwnership') state.pendingOwner = a[0];
    if (fn === 'acceptOwnership') { state.owner = account; state.pendingOwner = zeroAddress; }
    if (fn === 'renounceOwnership') state.owner = zeroAddress;
    if (fn === 'safeTransferFrom') state.owners.set(a[2], a[1]);
    if (fn === 'approve' && kind === 'LaunchToken') state.ercAllowance = a[1];
    if (fn === 'approve' && kind === 'permit2') { state.permitAmount = a[2]; state.permitExpiration = a[3]; }
  };
  const call = tx => {
    const { abi, kind, functionName: fn, args: a = [] } = decode(tx);
    const item = abi.find(x => x.type === 'function' && x.name === fn);
    if (state.revertSimulation && !['view','pure'].includes(item.stateMutability)) rpcError('execution reverted', 3, encodeErrorResult({ abi: appContracts.LoomCollection.abi, errorName: state.revertSimulation }));
    let result;
    if (kind === 'LoomFactory') result = ({ CREATE_FEE: 2000000000000000n, MAX_PAGE_SIZE: 100n, paused: state.factoryPaused, collectionCount: state.created ? 1n : 0n, implementation: appContracts.LoomCollection.address, pauser: account, PLATFORM: account, isCollection: state.created && key(a[0]) === key(clone), getCollections: state.created && a[0] === 0n ? [clone] : [], createCollection: clone, collections: clone })[fn];
    else if (kind === 'clone' || kind === 'LoomCollection') result = ({
      name: state.name, symbol: state.symbol, maxSupply: state.maxSupply, mintPriceWei: state.price, maxPerWallet: state.maxPerWallet,
      totalSupply: state.totalSupply, PLATFORM_FEE: 500000000000000n, creator: state.creator, owner: state.owner, pendingOwner: state.pendingOwner,
      royaltyBps: state.royalty, paused: state.paused, baseURI: state.baseURI, unrevealedURI: state.unrevealedURI,
      metadataFrozen: state.frozen, provenanceHash: state.provenanceHash, provenanceSet: state.provenanceSet, revealSeed: state.revealSeed,
      revealSeedSet: state.revealSeedSet, reserveMinted: state.reserveMinted, balanceOf: BigInt(balance(a[0])), mintedPerWallet: state.minted,
      ownerOf: state.owners.get(a[0]), tokenURI: state.baseURI ? `${state.baseURI}${a[0]}.json` : state.unrevealedURI,
      PLATFORM: account, RESERVE: account, CREATOR_FEE_SHARE: 200000000000000n, PLATFORM_FEE_SHARE: 200000000000000n, RESERVE_FEE_SHARE: 100000000000000n,
    })[fn];
    else if (kind === 'LaunchToken') result = ({ name: 'Loom', symbol: 'LOOM', decimals: 18, balanceOf: state.tokenBalance, allowance: state.ercAllowance, approve: true, totalSupply: 1000000000000000000000000000n })[fn];
    else if (kind === 'permit2') result = fn === 'allowance' ? [state.permitAmount,state.permitExpiration,0] : undefined;
    else if (kind === 'quoter') result = [a[0].exactAmount * 2n, 180000n];
    else if (kind === 'stateView') result = fn === 'getLiquidity' ? state.liquidity : [79228162514264337593543950336n,0,0,12500];
    if (!item.outputs?.length) return '0x';
    if (result === undefined) throw new Error(`Mock result missing for ${kind}.${fn}`);
    return encodeFunctionResult({ abi, functionName: fn, result });
  };
  const receipt = hash => {
    const pending = state.pending.get(hash); if (!pending || state.holdReceipt) return null;
    if (!pending.applied) { apply(pending.tx); pending.applied = true; }
    const d = decode(pending.tx); const logs = [];
    if (d.functionName === 'createCollection') logs.push({ address: appContracts.LoomFactory.address, topics: encodeEventTopics({ abi: appContracts.LoomFactory.abi, eventName: 'CollectionCreated', args: { collection: clone, owner: account } }), data: encodeAbiParameters([{ type:'string' },{ type:'uint256' }], [state.name, state.maxSupply]), blockNumber: toHex(block), blockHash, transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed:false });
    return { transactionHash: hash, transactionIndex:'0x0', blockHash, blockNumber:toHex(block), from:account, to:pending.tx.to, cumulativeGasUsed:'0x249f0', gasUsed:'0x249f0', contractAddress:null, logs, logsBloom:`0x${'00'.repeat(256)}`, status:'0x1', effectiveGasPrice:'0x3b9aca00', type:'0x2' };
  };
  async function rpc(method, params = [], wallet = false) {
    state.requests.push({ method, params, wallet });
    if (state.rpcDown && !wallet) rpcError('Test network unavailable');
    if (method === 'eth_chainId') return toHex(wallet ? state.walletChain : manifest.chainId);
    if (method === 'eth_accounts') return state.connected ? [account] : [];
    if (method === 'eth_requestAccounts') { if (state.rejectConnect) rpcError('User rejected the request', 4001); state.connected = true; return [account]; }
    if (method === 'wallet_switchEthereumChain') { if (!state.knownChain) rpcError('Unknown chain', 4902); state.walletChain = Number(params[0].chainId); return null; }
    if (method === 'wallet_addEthereumChain') { state.knownChain = true; return null; }
    if (method === 'wallet_requestPermissions') return [{ parentCapability:'eth_accounts' }];
    if (method === 'wallet_revokePermissions') { state.connected = false; return null; }
    if (method === 'eth_blockNumber') return toHex(++state.block);
    if (method === 'eth_getCode') return state.missingCode ? '0x' : key(params[0]) === key(clone) ? `0x363d3d373d3d3d363d73${appContracts.LoomCollection.address.slice(2)}5af43d82803e903d91602b57fd5bf3` : '0x6080604052600080fd';
    if (method === 'eth_call') return call(params[0]);
    if (method === 'eth_estimateGas') return '0x249f0';
    if (method === 'eth_gasPrice' || method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00';
    if (method === 'eth_getBalance') return toHex(state.nativeBalance);
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_sendTransaction') { if (state.rejectSend) rpcError('User rejected the request', 4001); const tx = params[0]; const hash = `0x${(state.sent.length + 1).toString(16).padStart(64,'0')}`; state.sent.push({ ...tx, decoded: decode(tx), hash }); state.pending.set(hash, { tx, applied:false }); return hash; }
    if (method === 'eth_getTransactionReceipt') return receipt(params[0]);
    if (method === 'eth_getTransactionByHash') { const p = state.pending.get(params[0]); return p ? { ...p.tx, hash:params[0], nonce:'0x0', blockHash, blockNumber:toHex(block), transactionIndex:'0x0', value:p.tx.value ?? '0x0', gas:'0x249f0', gasPrice:'0x3b9aca00', input:p.tx.data, v:'0x1',r:zeroHash,s:zeroHash,type:'0x2' } : null; }
    if (method === 'eth_getBlockByNumber') return { number:toHex(block),hash:blockHash,parentHash:zeroHash,nonce:'0x0000000000000000',sha3Uncles:zeroHash,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:zeroHash,stateRoot:zeroHash,receiptsRoot:zeroHash,miner:account,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x249f0',timestamp:toHex(Math.floor(Date.now()/1000)),transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:zeroHash };
    throw new Error(`Unexpected RPC method in test: ${method}`);
  }
  return { state, rpc, decode };
}

export async function attachMock(context, mock, { wallet = true } = {}) {
  await context.route(/^https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz)\/?$/, async route => {
    const payload = route.request().postDataJSON();
    const respond = async req => { try { return { jsonrpc:'2.0', id:req.id, result:await mock.rpc(req.method,req.params) }; } catch (e) { return { jsonrpc:'2.0', id:req.id, error:{code:e.code ?? -32000,message:e.message,data:e.data} }; } };
    await route.fulfill({ contentType:'application/json', body:JSON.stringify(Array.isArray(payload) ? await Promise.all(payload.map(respond)) : await respond(payload)) });
  });
  if (!wallet) return;
  await context.exposeBinding('__testWalletRequest', async (_, { method, params }) => { try { return { result: await mock.rpc(method, params, true) }; } catch (e) { return { error:{ message:e.message,code:e.code ?? -32000,data:e.data } }; } });
  await context.addInitScript(() => {
    const listeners = {};
    const provider = { on: (event, fn) => { (listeners[event] ??= new Set()).add(fn); }, removeListener: (event, fn) => listeners[event]?.delete(fn), emit: (event,data) => listeners[event]?.forEach(fn => fn(data)), request: async args => { const response = await window.__testWalletRequest(args); if (response.error) throw Object.assign(new Error(response.error.message), response.error); if (args.method === 'wallet_switchEthereumChain') provider.emit('chainChanged',args.params[0].chainId); return response.result; } };
    window.ethereum = provider; window.__testProvider = provider;
    const announce = () => { for (const [name,rdns,uuid] of [['Test wallet','test.loom.wallet','0de38665-e31b-4320-912d-3dedf0239900'],['Second wallet','test.loom.second','0de38665-e31b-4320-912d-3dedf0239901']]) dispatchEvent(new CustomEvent('eip6963:announceProvider',{ detail:{ info:{name,rdns,uuid,icon:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'},provider } })); };
    addEventListener('eip6963:requestProvider',announce); announce();
  });
}
