import { useState, type FormEvent } from 'react';
import { useConnection } from 'wagmi';
import { maxUint256, type Address } from 'viem';
import { useRuntime } from './context';
import { readCollection, useCollection, useDeploymentCheck } from './data';
import { Arrow, AddressView, Field, Notice } from './ui';
import { eth, explain, sameAddress, uint } from './utils';
import { useTransaction, TransactionStatus } from './transactions';
import { Tokens } from './Tokens';
import { OwnerPanel } from './OwnerPanel';

export function CollectionPage({ address }: { address: Address }) {
  const runtime = useRuntime(); const { address: wallet, chainId } = useConnection();
  const collection = useCollection(address); const verified = useDeploymentCheck(); const tx = useTransaction(`mint-${address}`);
  const [quantity, setQuantity] = useState('1'); const [error, setError] = useState('');
  const data = collection.data;
  if (!data) return <div className="page"><a className="back-link" href="#/"><Arrow back />All collections</a>{collection.isError ? <Notice error>{explain(collection.error)} <button className="button" onClick={() => void collection.refetch()}>Retry collection</button></Notice> : <p role="status">Reading collection from {runtime.chain.name}…</p>}</div>;
  const remaining = data.maxSupply - data.totalSupply;
  const allowance = data.maxPerWallet > data.minted ? data.maxPerWallet - data.minted : 0n;
  const q = /^\d+$/.test(quantity) ? BigInt(quantity) : 0n;
  const total = (data.mintPriceWei + data.PLATFORM_FEE) * q;
  const eligible = !!wallet && chainId === runtime.chain.id && verified.data && !data.paused && remaining > 0n && allowance > 0n && !collection.isError;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const qty = uint(quantity); if (!wallet || !eligible) throw new Error('Connect on the correct network and check mint availability.');
      const fresh = await readCollection(runtime, address, wallet);
      if (fresh.paused) throw new Error('Minting is paused by the owner.');
      if (qty > fresh.maxSupply - fresh.totalSupply) throw new Error('Choose a quantity within the remaining supply.');
      if (qty > fresh.maxPerWallet - fresh.minted) throw new Error('Choose a quantity within your remaining lifetime mint allowance.');
      const payment = (fresh.mintPriceWei + fresh.PLATFORM_FEE) * qty;
      if (payment > maxUint256) throw new Error('This batch payment exceeds the contract limit.');
      if (payment !== total) throw new Error('Mint terms refreshed. Review the new price and try again.');
      await tx.run(`Mint ${qty.toString()} ${qty === 1n ? 'token' : 'tokens'}`, { address, abi: runtime.contracts.LoomCollection.abi, functionName: 'mint', args: [qty], value: payment });
    } catch (e) { setError(explain(e)); }
  };
  return <div className="page">
    <a className="back-link" href="#/"><Arrow back />All collections</a>
    <div className="collection-layout">
      <div className="collection-intro"><h1>{data.name}</h1><p className="muted">{data.symbol} · {data.totalSupply.toString()} / {data.maxSupply.toString()} minted</p>
        <div className="edition-rule" aria-hidden="true"><span style={{ width: `${data.maxSupply ? Number(data.totalSupply * 10000n / data.maxSupply) / 100 : 0}%` }} /></div>
        <div className="metadata-state"><svg aria-hidden="true" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="2">{[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${12 + i * 9} 10v52M10 ${14 + i * 9}h52`} />)}</svg><h2>{data.baseURI ? 'Metadata revealed' : data.unrevealedURI ? 'Art awaiting reveal' : 'The canvas is waiting'}</h2><p>{data.baseURI ? 'This collection has a metadata directory. View individual token metadata below.' : data.unrevealedURI ? 'The owner has set a preview. Final metadata is not revealed yet.' : 'The owner has not set art or metadata yet. Minting creates a token without an image.'}</p></div>
      </div>
      <section className="mint-panel" aria-labelledby="mint-heading"><div className="section-head"><h2 id="mint-heading">Mint this collection</h2><span className="state-label">{data.paused ? 'Paused' : remaining === 0n ? 'Sold out' : 'Open'}</span></div>
        <form onSubmit={submit}>
          <dl className="facts"><div><dt>Creator price / token</dt><dd>{eth(data.mintPriceWei)} ETH</dd></div><div><dt>Platform fee / token</dt><dd>{eth(data.PLATFORM_FEE)} ETH</dd></div><div><dt>Remaining supply</dt><dd>{remaining.toString()}</dd></div><div><dt>{wallet ? 'Your remaining allowance' : 'Lifetime wallet cap'}</dt><dd>{(wallet ? allowance : data.maxPerWallet).toString()}</dd></div></dl>
          <Field label="Quantity"><input inputMode="numeric" pattern="[0-9]+" name="quantity" required value={quantity} onChange={e => setQuantity(e.target.value)} /></Field>
          <div className="mint-total"><span>Total payment</span><strong>{q > 0n && total <= maxUint256 ? `${eth(total)} ETH` : 'Enter a quantity'}</strong></div>
          <button className="button primary full" disabled={!eligible || tx.busy}>{tx.pending ? 'Minting…' : 'Mint tokens'}<Arrow /></button>
          <p className="hint">Exact payment + network gas. USD value unavailable.</p>
          {!wallet ? <p className="action-hint">Connect your wallet above to mint.</p> : chainId !== runtime.chain.id ? <p className="action-hint">Switch to {runtime.chain.name} above to mint.</p> : !verified.data ? <p className="action-hint">Verifying deployed contracts…</p> : data.paused ? <p className="action-hint">The owner has paused minting.</p> : allowance === 0n ? <p className="action-hint">You have used your lifetime mint allowance.</p> : remaining === 0n ? <p className="action-hint">All tokens have been minted.</p> : null}
          {error && <Notice error>{error}</Notice>}{collection.isError && <Notice error>Could not refresh collection state. <button type="button" className="text-button" onClick={() => void collection.refetch()}>Retry</button></Notice>}<TransactionStatus id={`mint-${address}`} />
        </form>
      </section>
    </div>
    <Tokens collection={address} balance={data.balance} totalSupply={data.totalSupply} />
    {(sameAddress(wallet, data.owner) || sameAddress(wallet, data.pendingOwner)) && <OwnerPanel address={address} data={data} />}
    <details className="collection-details"><summary>Collection details & fees</summary><dl className="facts"><div><dt>Secondary-sale royalty</dt><dd>{Number(data.royaltyBps) / 100}%</dd></div><div><dt>Metadata</dt><dd>{data.metadataFrozen ? 'Permanently frozen' : 'Owner can change it'}</dd></div><div><dt>Last read at block</dt><dd>{data.blockNumber.toString()}</dd></div></dl><p>Each token pays a fixed {eth(data.PLATFORM_FEE)} ETH platform fee: 40% to the creator, 40% to the platform, and 20% to the reserve. The full creator price goes to the creator.</p><p className="hint">Royalties are fixed by the creator; marketplaces decide whether to honor them. Transferring a token does not restore the public mint allowance.</p><AddressView address={address} label="Collection contract" /><AddressView address={data.creator} label="Creator & royalty recipient" /><AddressView address={data.owner} label="Collection owner" /></details>
  </div>;
}
