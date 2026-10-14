import { useEffect, useState } from 'react';
import { useConnection } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, type Address } from 'viem';
import { useRuntime } from './context';
import { useBalances, useDeploymentCheck } from './data';
import { amount, eth, explain, sameAddress, uint } from './utils';
import { Field, Notice, Arrow } from './ui';
import { permit2Abi, poolId, quoterAbi, routerAbi, stateViewAbi, swapInput } from './swap-protocol';
import { TransactionStatus, useTransaction } from './transactions';

type Quote = { amountIn: bigint; amountOut: bigint; minimum: bigint; expires: number; input: string; buying: boolean; slippage: string; account?: Address };
export function Trade() {
  const runtime = useRuntime(); const { address, chainId } = useConnection(); const balances = useBalances(); const verified = useDeploymentCheck();
  const [buying, setBuying] = useState(true); const [input, setInput] = useState(''); const [slippage, setSlippage] = useState('0.5'); const [quote, setQuote] = useState<Quote>(); const [quoting, setQuoting] = useState(false); const [error, setError] = useState(''); const [now, setNow] = useState(Date.now());
  const approval = useTransaction('token-approval'); const permit = useTransaction('permit-approval'); const swap = useTransaction('swap');
  const { poolKey: key, network } = runtime.deployment; const protocol = network.uniswapV4;
  const token = runtime.contracts.LaunchToken;
  const native = key && /^0x0{40}$/i.test(key.currency0) ? key.currency0 : key?.currency1;
  const pool = useQuery({ queryKey: ['pool'], enabled: !!key, queryFn: async () => {
    if (!key || !native || ![key.currency0, key.currency1].some(a => sameAddress(a, token.address)) || !/^0x0{40}$/i.test(native)) throw new Error('This trade view needs the attested native-ETH / LOOM pool.');
    for (const a of [protocol.quoter, protocol.universalRouter, protocol.permit2, protocol.stateView]) { const code = await runtime.client.getCode({ address: a }); if (!code || code === '0x') throw new Error('A configured trading contract has no deployed code.'); }
    const [liquidity, decimals, symbol] = await Promise.all([
      runtime.client.readContract({ address: protocol.stateView, abi: stateViewAbi, functionName: 'getLiquidity', args: [poolId(key)] }),
      runtime.client.readContract({ ...token, functionName: 'decimals' }) as Promise<number>,
      runtime.client.readContract({ ...token, functionName: 'symbol' }) as Promise<string>,
    ]);
    return { liquidity, decimals, symbol };
  }, refetchInterval: 20_000, retry: 1 });
  const allowances = useQuery({ queryKey: ['allowances', address], enabled: !!address && !!pool.data, queryFn: async () => {
    const [erc20, permit] = await Promise.all([
      runtime.client.readContract({ ...token, functionName: 'allowance', args: [address!, protocol.permit2] }) as Promise<bigint>,
      runtime.client.readContract({ address: protocol.permit2, abi: permit2Abi, functionName: 'allowance', args: [address!, token.address, protocol.universalRouter] }),
    ]); return { erc20, amount: permit[0], expiration: permit[1] };
  }, refetchInterval: 15_000, retry: 1 });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setQuote(undefined); setError(''); }, [input, buying, slippage, address, chainId]);
  const inputSymbol = buying ? 'ETH' : pool.data?.symbol ?? 'LOOM'; const outputSymbol = buying ? pool.data?.symbol ?? 'LOOM' : 'ETH';
  const inputDecimals = buying ? network.nativeCurrency.decimals : pool.data?.decimals ?? 18;
  const outputDecimals = buying ? pool.data?.decimals ?? 18 : network.nativeCurrency.decimals;
  const validQuote = quote && quote.expires > now && quote.input === input && quote.buying === buying && quote.slippage === slippage && quote.account === address;
  const canSign = !!address && chainId === runtime.chain.id && verified.data && !!pool.data?.liquidity && validQuote && !swap.busy;
  const step = !buying && quote ? !allowances.data || allowances.isError ? 'loading' : allowances.data.erc20 < quote.amountIn ? 'erc20' : allowances.data.amount < quote.amountIn || allowances.data.expiration < Math.floor(now / 1000) + 180 ? 'permit' : 'swap' : 'swap';
  const getQuote = async () => {
    if (!key || !native || !pool.data || quoting) return;
    setQuoting(true); setError(''); setQuote(undefined);
    try {
      const amountIn = amount(input, inputDecimals); const bps = amount(slippage, 2, true);
      if (amountIn >= 2n ** 128n) throw new Error('This amount exceeds the pool’s per-swap limit.');
      if (bps > 500n) throw new Error('Choose slippage between 0% and 5%.');
      const inputCurrency = buying ? native : token.address;
      const result = await runtime.client.simulateContract({ address: protocol.quoter, abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ poolKey: key, zeroForOne: sameAddress(inputCurrency, key.currency0), exactAmount: amountIn, hookData: '0x' }] });
      const amountOut = result.result[0]; const minimum = amountOut * (10000n - bps) / 10000n;
      if (minimum === 0n || minimum >= 2n ** 128n) throw new Error('No usable quote for this amount. Try a different amount.');
      setQuote({ amountIn, amountOut, minimum, expires: Date.now() + 60_000, input, buying, slippage, account: address });
    } catch (e) { setError(explain(e)); } finally { setQuoting(false); }
  };
  const act = async () => {
    setError('');
    if (!key || !native || !quote || !canSign) return;
    try {
      if (step === 'erc20') { await approval.run('Approve LOOM to Permit2', { ...token, functionName: 'approve', args: [protocol.permit2, quote.amountIn] }); return; }
      if (step === 'permit') { const block = await runtime.client.getBlock(); await permit.run('Authorize router in Permit2', { address: protocol.permit2, abi: permit2Abi, functionName: 'approve', args: [token.address, protocol.universalRouter, quote.amountIn, Number(block.timestamp) + 3600] }); return; }
      if (!buying) { const fresh = await allowances.refetch(); if (!fresh.data || fresh.data.erc20 < quote.amountIn || fresh.data.amount < quote.amountIn || fresh.data.expiration < Math.floor(Date.now() / 1000) + 180) throw new Error('Allowances changed. Review the approval step again.'); }
      if (quote.expires <= Date.now()) throw new Error('This quote expired. Get a new quote before swapping.');
      const block = await runtime.client.getBlock();
      await swap.run(`Swap ${inputSymbol} for ${outputSymbol}`, { address: protocol.universalRouter, abi: routerAbi, functionName: 'execute', args: ['0x10', [swapInput(key, buying ? native : token.address, quote.amountIn, quote.minimum, !!protocol.extendedSwapParams)], block.timestamp + 180n], value: buying ? quote.amountIn : 0n });
      setQuote(undefined);
    } catch (e) { setError(explain(e)); }
  };
  return <div className="page trade-page"><div className="page-heading"><h1>Trade Loom.</h1><p>The launch token, on {network.name}.</p></div><div className="trade-layout"><section className="trade-panel"><div className="segmented"><button className={buying ? 'selected' : ''} onClick={() => setBuying(true)} aria-pressed={buying}>Buy LOOM</button><button className={!buying ? 'selected' : ''} onClick={() => setBuying(false)} aria-pressed={!buying}>Sell LOOM</button></div>
    <Field label={`You pay (${inputSymbol})`}><input inputMode="decimal" name="swapAmount" value={input} onChange={e => setInput(e.target.value)} placeholder="0.00" /></Field>
    {balances.data && <p className="hint balance">Balance: {buying ? eth(balances.data.native) : formatUnits(balances.data.token, balances.data.decimals)} {inputSymbol}</p>}
    <Field label="Slippage tolerance (%)" hint="The swap reverts below your minimum received."><input inputMode="decimal" value={slippage} onChange={e => setSlippage(e.target.value)} /></Field>
    <button className="button full" disabled={quoting || !pool.data?.liquidity || !verified.data || swap.busy} onClick={() => void getQuote()}>{quoting ? 'Getting quote…' : 'Get quote'}</button>
    {quote && <dl className="facts quote"><div><dt>Expected received</dt><dd>{formatUnits(quote.amountOut, outputDecimals)} {outputSymbol}</dd></div><div><dt>Minimum received</dt><dd>{formatUnits(quote.minimum, outputDecimals)} {outputSymbol}</dd></div><div><dt>Quoted rate</dt><dd>{formatUnits(quote.amountOut * 10n ** BigInt(inputDecimals) / quote.amountIn, outputDecimals)} {outputSymbol} / {inputSymbol}</dd></div><div><dt>Quote</dt><dd>{validQuote ? `Expires in ${Math.max(0, Math.ceil((quote.expires - now) / 1000))}s` : 'Expired; get a new quote'}</dd></div></dl>}
    {quote && <><button className="button primary full" disabled={!canSign || step === 'loading'} onClick={() => void act()}>{approval.pending ? 'Approving token…' : permit.pending ? 'Authorizing router…' : swap.pending ? 'Swapping…' : step === 'erc20' ? '1. Approve LOOM to Permit2' : step === 'permit' ? '2. Authorize the router' : step === 'loading' ? 'Reading allowances…' : `Swap for ${outputSymbol}`}<Arrow /></button>{!buying && <p className="hint">Token approval and router authorization are separate transactions for the exact input amount. Router authorization lasts one hour.</p>}</>}
    {!address ? <p className="action-hint">Connect your wallet above to trade.</p> : chainId !== runtime.chain.id ? <p className="action-hint">Switch to {runtime.chain.name} above.</p> : null}
    {(!key || pool.isError || pool.data?.liquidity === 0n) && <Notice error>{!key ? 'The deployment has no pool.' : pool.isError ? explain(pool.error) : 'This pool has no active liquidity. Trading is unavailable.'}<button className="text-button" onClick={() => void pool.refetch()}>Retry pool</button></Notice>}
    {allowances.isError && !buying && <Notice error>Allowances could not be read. <button className="text-button" onClick={() => void allowances.refetch()}>Retry allowances</button></Notice>}
    {error && <Notice error>{error}</Notice>}<TransactionStatus />
    </section><aside className="trade-notes"><h2>A separate thread</h2><p>You do not need LOOM to create a collection or mint an NFT. Those actions use Sepolia ETH.</p><dl className="facts"><div><dt>Pool fee</dt><dd>{key ? `${key.fee / 10000}%` : 'Unavailable'}</dd></div><div><dt>Route</dt><dd>Uniswap v4</dd></div><div><dt>Deadline</dt><dd>3 minutes</dd></div></dl><p className="hint">Quotes come from the configured quoter. The router transaction is simulated before signing. The quoted output includes pool fees; gas is extra. USD value is unavailable.</p><a href={`${network.explorer}/address/${token.address}`} target="_blank" rel="noreferrer">View LOOM contract ↗</a></aside></div></div>;
}
