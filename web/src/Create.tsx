import { useState, type FormEvent } from 'react';
import { useConnection } from 'wagmi';
import { decodeEventLog, maxUint256, type Address } from 'viem';
import { useRuntime } from './context';
import { useDeploymentCheck, useFactory } from './data';
import { amount, eth, explain, recipient, uint } from './utils';
import { Arrow, Field, Notice } from './ui';
import { TransactionStatus, useTransaction } from './transactions';

export function Create() {
  const runtime = useRuntime(); const { address, chainId } = useConnection();
  const factory = useFactory(); const verified = useDeploymentCheck(); const tx = useTransaction('create');
  const [name, setName] = useState(''); const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('1000'); const [price, setPrice] = useState('0'); const [cap, setCap] = useState('3'); const [royalty, setRoyalty] = useState('5');
  const [customCreator, setCustomCreator] = useState(false); const [creator, setCreator] = useState(''); const [error, setError] = useState('');
  const ready = !!address && chainId === runtime.chain.id && verified.data && factory.data && !factory.data.paused;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try {
      if (!name.trim() || !symbol.trim()) throw new Error('Enter a collection name and symbol.');
      const maxSupply = uint(supply, 'Supply'); const maxPerWallet = uint(cap, 'Wallet cap'); const mintPrice = amount(price, 18, true);
      if (maxPerWallet > maxSupply) throw new Error('The wallet cap must be at most the collection supply.');
      const royaltyBps = amount(royalty, 2, true);
      if (royaltyBps > 1000n) throw new Error('Choose a royalty from 0% to 10%, with at most two decimal places.');
      const platformFee = await runtime.client.readContract({ ...runtime.contracts.LoomCollection, functionName: 'PLATFORM_FEE' }) as bigint;
      if (mintPrice > maxUint256 - platformFee) throw new Error('This mint price exceeds the contract limit.');
      const owner = recipient(customCreator ? creator.trim() : address ?? '');
      const fresh = await factory.refetch();
      if (!ready || !fresh.data || fresh.data.paused) throw new Error('Connect on the correct network and wait for creation to be available.');
      await tx.run('Create collection', { ...runtime.contracts.LoomFactory, functionName: 'createCollection', args: [name.trim(), symbol.trim(), maxSupply, mintPrice, maxPerWallet, owner, royaltyBps], value: fresh.data.fee }, receipt => {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== runtime.contracts.LoomFactory.address.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({ abi: runtime.contracts.LoomFactory.abi, eventName: 'CollectionCreated', data: log.data, topics: log.topics });
            const collection = (decoded.args as unknown as { collection: Address }).collection;
            location.hash = `/collection/${collection}`; break;
          } catch { /* Other events in this receipt are not collection creation. */ }
        }
      });
    } catch (e) { setError(explain(e)); }
  };
  return <div className="page narrow-page">
    <a className="back-link" href="#/"><Arrow back />All collections</a>
    <div className="page-heading"><h1>Create a collection.</h1><p>Set the edition. Make it yours.</p></div>
    <form className="create-layout" onSubmit={submit}>
      <div className="form-fields">
        <div className="form-grid"><Field label="Collection name"><input name="name" autoComplete="off" required maxLength={120} placeholder="e.g. Field notes" value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Symbol"><input name="symbol" autoComplete="off" required maxLength={16} placeholder="e.g. FIELD" value={symbol} onChange={e => setSymbol(e.target.value)} /></Field></div>
        <div className="form-grid"><Field label="Maximum supply" hint="The total edition size, including owner mints."><input name="supply" inputMode="numeric" pattern="[0-9]+" required value={supply} onChange={e => setSupply(e.target.value)} /></Field><Field label="Mints per wallet" hint="A lifetime public mint limit, even after transfers."><input name="cap" inputMode="numeric" pattern="[0-9]+" required value={cap} onChange={e => setCap(e.target.value)} /></Field></div>
        <div className="form-grid"><Field label="Mint price (ETH)" hint="0 is a free mint. The platform fee still applies."><input name="price" inputMode="decimal" required value={price} onChange={e => setPrice(e.target.value)} /></Field><Field label="Royalty (%)" hint="0–10%. Marketplaces choose whether to honor it."><input name="royalty" inputMode="decimal" required value={royalty} onChange={e => setRoyalty(e.target.value)} /></Field></div>
        <details><summary>Creator payment address</summary><p className="hint">Your connected wallet receives creator proceeds and royalties by default.</p><label className="check-label"><input type="checkbox" checked={customCreator} onChange={e => setCustomCreator(e.target.checked)} />Use another creator address</label>{customCreator && <Field label="Creator address"><input name="creator" autoComplete="off" spellCheck="false" required value={creator} onChange={e => setCreator(e.target.value)} placeholder="0x…" /></Field>}{!customCreator && address && <p className="address">{address}</p>}</details>
      </div>
      <aside className="create-summary">
        <h2>Your first thread</h2>
        <dl className="facts"><div><dt>Creation fee</dt><dd>{factory.data ? `${eth(factory.data.fee)} ETH` : 'Reading…'}</dd></div><div><dt>Network</dt><dd>{runtime.chain.name} testnet</dd></div><div><dt>Owner</dt><dd>{address ? 'Connected wallet' : 'Connect to set'}</dd></div></dl>
        <p className="hint">Name, supply, price, wallet cap, creator and royalty become permanent. Art and metadata can be set after creation.</p>
        {!address ? <p className="action-hint">Connect your wallet above to create.</p> : chainId !== runtime.chain.id ? <p className="action-hint">Switch to {runtime.chain.name} above.</p> : factory.data?.paused ? <Notice>Collection creation is paused by the factory pauser.</Notice> : !verified.data ? <p className="action-hint">Verifying deployed contracts…</p> : null}
        {factory.isError && <Notice error>Could not read the creation fee. <button type="button" className="text-button" onClick={() => void factory.refetch()}>Retry</button></Notice>}
        <button type="submit" className="button primary full" disabled={!ready || tx.busy}>{tx.pending ? 'Creating…' : 'Create collection'}<Arrow /></button>
        <p className="hint">Exact fee + network gas. USD value unavailable on this testnet.</p>
        {error && <Notice error>{error}</Notice>}<TransactionStatus id="create" />
      </aside>
    </form>
  </div>;
}
