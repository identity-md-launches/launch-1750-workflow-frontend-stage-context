import { useInfiniteQuery } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import { useId, useState } from 'react';
import type { Address } from 'viem';
import { useRuntime } from './context';
import { externalUri, sameAddress, recipient, explain, uint } from './utils';
import { Field, Notice } from './ui';
import { useTransaction, TransactionStatus } from './transactions';

export function Tokens({ collection, balance, totalSupply }: { collection: Address; balance: bigint; totalSupply: bigint }) {
  const runtime = useRuntime(); const { address: wallet, chainId } = useConnection();
  const [transferId, setTransferId] = useState(''); const [to, setTo] = useState(''); const [error, setError] = useState('');
  const tx = useTransaction(`transfer-${collection}`);
  const headingId = useId();
  const tokens = useInfiniteQuery({
    queryKey: ['tokens', collection.toLowerCase(), wallet], enabled: !!wallet && totalSupply > 0n,
    initialPageParam: { start: 1n, block: 0n, supply: 0n },
    queryFn: async ({ pageParam }) => {
      const block = pageParam.block || await runtime.client.getBlockNumber();
      const supply = pageParam.supply || await runtime.client.readContract({ address: collection, abi: runtime.contracts.LoomCollection.abi, functionName: 'totalSupply', blockNumber: block }) as bigint;
      const end = pageParam.start + 49n > supply ? supply : pageParam.start + 49n;
      const ids = Array.from({ length: Number(end - pageParam.start + 1n) }, (_, i) => pageParam.start + BigInt(i));
      const owned = await Promise.all(ids.map(async id => {
        const owner = await runtime.client.readContract({ address: collection, abi: runtime.contracts.LoomCollection.abi, functionName: 'ownerOf', args: [id], blockNumber: block }) as Address;
        if (!sameAddress(owner, wallet)) return null;
        const uri = await runtime.client.readContract({ address: collection, abi: runtime.contracts.LoomCollection.abi, functionName: 'tokenURI', args: [id], blockNumber: block }) as string;
        return { id, uri };
      }));
      return { owned: owned.filter(t => t !== null), end, block, supply };
    },
    getNextPageParam: last => last.end < last.supply ? { start: last.end + 1n, block: last.block, supply: last.supply } : undefined,
    retry: 1,
  });
  const items = tokens.data?.pages.flatMap(p => p.owned) ?? [];
  const last = tokens.data?.pages.at(-1);
  return <section className="tokens-section" aria-labelledby={headingId}>
    <div className="section-head"><h2 id={headingId}>Your tokens</h2>{wallet && <button className="text-button" onClick={() => void tokens.refetch()} disabled={tokens.isFetching}>Refresh tokens</button>}</div>
    {!wallet ? <p className="muted">Connect your wallet to see what you collect.</p> : <>
      <p className="muted">Current balance: {balance.toString()} {balance === 1n ? 'token' : 'tokens'}</p>
      {totalSupply === 0n ? <p>No tokens minted yet. Yours could be the first.</p> : tokens.isLoading ? <p role="status">Checking token ownership…</p> : <>
        {tokens.isError && <Notice error>Could not check ownership. <button className="text-button" onClick={() => void tokens.refetch()}>Retry</button></Notice>}
        {!!items.length && <ul className="token-list">{items.map(t => <li key={String(t.id)}><span className="token-mark" aria-hidden="true">✳</span><strong>Token #{t.id.toString()}</strong>{externalUri(t.uri) ? <a href={externalUri(t.uri)} target="_blank" rel="noreferrer">View metadata ↗</a> : <span className="muted">Metadata not set</span>}</li>)}</ul>}
        {!items.length && !tokens.isError && <p>{tokens.hasNextPage ? 'No owned tokens in this range yet.' : 'You do not own tokens in this collection.'}</p>}
        {last && <p className="hint">Checked {last.end.toString()} of {last.supply.toString()} token IDs at block {last.block.toString()}. Ownership can change after this snapshot.</p>}
        {tokens.hasNextPage && <button className="button" disabled={tokens.isFetching} onClick={() => void tokens.fetchNextPage()}>{tokens.isFetching ? 'Checking…' : 'Check next 50 token IDs'}</button>}
      </>}
      {balance > 0n && <details className="transfer-details"><summary>Transfer a token</summary><p className="hint">Send one of your tokens to another address. This does not restore your lifetime mint allowance.</p><form onSubmit={async e => { e.preventDefault(); setError(''); try { await tx.run('Transfer token', { address: collection, abi: runtime.contracts.LoomCollection.abi, functionName: 'safeTransferFrom', args: [wallet, recipient(to.trim()), uint(transferId, 'Token ID')] }); } catch (err) { setError(explain(err)); } }}><div className="form-grid"><Field label="Token ID"><input inputMode="numeric" required value={transferId} onChange={e => setTransferId(e.target.value)} /></Field><Field label="Recipient address"><input required spellCheck="false" autoComplete="off" value={to} onChange={e => setTo(e.target.value)} placeholder="0x…" /></Field></div><button className="button" disabled={tx.busy || chainId !== runtime.chain.id}>{tx.pending ? 'Transferring…' : 'Transfer token'}</button>{error && <Notice error>{error}</Notice>}<TransactionStatus id={`transfer-${collection}`} /></form></details>}
    </>}
  </section>;
}
