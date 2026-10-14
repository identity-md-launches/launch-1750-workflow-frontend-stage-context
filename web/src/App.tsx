import { useEffect, useState } from 'react';
import { useConnection } from 'wagmi';
import { isAddress, type Address } from 'viem';
import { useRuntime } from './context';
import { useCollection, useCollectionAddresses, useDeploymentCheck, useFactory } from './data';
import { Arrow, Mark, Weave, Notice, AddressView } from './ui';
import { eth, explain, sameAddress } from './utils';
import { Wallet } from './Wallet';
import { Create } from './Create';
import { CollectionPage } from './CollectionPage';
import { Tokens } from './Tokens';
import { Trade } from './Trade';
import { TransactionProvider, TransactionStatus, useTransaction } from './transactions';

function CollectionCard({ address, owned = false }: { address: Address; owned?: boolean }) {
  const collection = useCollection(address); const data = collection.data;
  if (!data) return <article className="collection-card"><h3>Collection</h3><p className="address">{address}</p>{collection.isError ? <><p className="error-text">Could not read this collection.</p><button className="button" onClick={() => void collection.refetch()}>Retry</button></> : <p role="status">Reading collection…</p>}</article>;
  if (owned && data.balance === 0n) return null;
  return <article className={owned ? 'owned-collection' : 'collection-card'}>
    <div className="card-heading"><div className="collection-mark" aria-hidden="true"><Mark /></div><span className="state-label">{data.paused ? 'Paused' : data.totalSupply === data.maxSupply ? 'Sold out' : 'Mint open'}</span></div>
    <h3><a href={`#/collection/${address}`}>{data.name}</a></h3>
    <div className="card-stats"><span>{data.totalSupply.toString()} / {data.maxSupply.toString()} minted</span><strong>{eth(data.mintPriceWei + data.PLATFORM_FEE)} ETH</strong></div>
    <a className="card-link" href={`#/collection/${address}`}>View collection<Arrow /></a>
    {owned && <Tokens collection={address} balance={data.balance} totalSupply={data.totalSupply} />}
  </article>;
}
function FactoryControl() {
  const runtime = useRuntime(); const factory = useFactory(); const verification = useDeploymentCheck(); const { address, chainId } = useConnection(); const tx = useTransaction('factory-pause');
  if (!factory.data || !sameAddress(address, factory.data.pauser)) return null;
  return <details className="factory-control"><summary>Factory pauser controls</summary><p>Pause or resume collection creation. Existing collections keep their own settings.</p><button className="button" disabled={tx.busy || !verification.data || chainId !== runtime.chain.id} onClick={() => void tx.run(factory.data!.paused ? 'Resume collection creation' : 'Pause collection creation', { ...runtime.contracts.LoomFactory, functionName: factory.data!.paused ? 'unpause' : 'pause' })}>{tx.pending ? 'Processing…' : factory.data.paused ? 'Resume collection creation' : 'Pause collection creation'}</button><TransactionStatus id="factory-pause" /></details>;
}
function Collections({ owned = false }: { owned?: boolean }) {
  const [page, setPage] = useState(0); const addresses = useCollectionAddresses(page); const factory = useFactory(); const { address } = useConnection();
  return <section className="collections" aria-labelledby="collections-heading"><div className="section-head"><div><h2 id="collections-heading">{owned ? 'Your collection shelf' : 'Explore collections'}</h2><p className="hint">{owned ? 'Tokens held by your connected wallet.' : 'Created on Loom. Ready to become yours.'}</p></div><button className="text-button" onClick={() => { void factory.refetch(); void addresses.refetch(); }} disabled={addresses.isFetching}>Refresh</button></div>
    {owned && !address ? <div className="empty-state"><Mark /><h3>Your collection starts here.</h3><p>Connect your wallet to see the tokens you hold.</p><a href="#/" className="button">Explore collections<Arrow /></a></div> : addresses.isError || factory.isError ? <Notice error>Collections are unavailable right now. <button className="text-button" onClick={() => { void factory.refetch(); void addresses.refetch(); }}>Retry network reads</button></Notice> : addresses.isLoading || factory.isLoading ? <div className="empty-state" role="status"><Mark /><h3>Reading the collection registry…</h3><p>Loading live state from Sepolia.</p></div> : !addresses.data?.length ? <div className="empty-state"><Mark /><h3>The first collection is still to come.</h3><p>Start with a name, an edition size, and an idea.</p><a className="button" href="#/create">Create a collection<Arrow /></a></div> : <><div className={owned ? 'owned-collections' : 'collection-grid'}>{addresses.data.map(a => <CollectionCard key={a} address={a} owned={owned} />)}</div>{owned && <p className="hint">Only collections you hold tokens in appear above. Checking factory entries {page * 12 + 1}–{page * 12 + addresses.data.length}; continue through all pages to check the full registry.</p>}<div className="pagination"><button className="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1}</span><button className="button" disabled={BigInt((page + 1) * 12) >= (factory.data?.count ?? 0n)} onClick={() => setPage(p => p + 1)}>Next</button></div></>}
  </section>;
}
function Home() {
  const factory = useFactory(); const { deployment } = useRuntime();
  return <div className="page home"><section className="home-intro"><div className="hero-copy"><h1>Art starts with<br /><em>a collection.</em></h1><p>A place to launch and collect NFT editions, with art by the IMD swarm.</p><a className="button primary" href="#/create">Create a collection<Arrow /></a><p className="hero-fee">{factory.data ? `${eth(factory.data.fee)} ETH to create` : 'Reading creation fee…'} · {deployment.network.name} testnet</p></div><div className="hero-art"><Weave /><div className="art-caption"><span>Many threads. One collection.</span><span aria-hidden="true">↗</span></div></div></section>
    <Collections /><FactoryControl />
    <section className="how-it-works"><h2>From an idea to an edition.</h2><div className="how-grid"><div><span className="step-number">01</span><h3>Set the collection</h3><p>Choose your name, supply, mint price and royalty. Your wallet owns the collection.</p></div><div><span className="step-number">02</span><h3>Prepare the art</h3><p>Pin your art and metadata to IPFS, then add the metadata URI in your owner studio.</p></div><div><span className="step-number">03</span><h3>Open it to collectors</h3><p>Share the collection link. Every mint pays the creator price plus a fixed 0.0005 ETH fee.</p></div></div></section>
  </div>;
}
function Shell() {
  const runtime = useRuntime(); const [route, setRoute] = useState(location.hash.slice(1) || '/'); const verification = useDeploymentCheck();
  useEffect(() => { const changed = () => { setRoute(location.hash.slice(1) || '/'); window.scrollTo(0, 0); requestAnimationFrame(() => document.querySelector<HTMLElement>('main')?.focus()); }; addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed); }, []);
  const collectionAddress = route.startsWith('/collection/') ? route.split('/')[2] : undefined;
  return <><a href="#main-content" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a><header className="site-header"><a className="brand" href="#/" aria-label="Loom home"><Mark /><span>loom</span></a><nav aria-label="Main navigation"><a href="#/" aria-current={route === '/' ? 'page' : undefined}>Explore</a><a href="#/create" aria-current={route === '/create' ? 'page' : undefined}>Create</a><a href="#/tokens" aria-current={route === '/tokens' ? 'page' : undefined}>Your tokens</a><a href="#/trade" aria-current={route === '/trade' ? 'page' : undefined}>Trade</a></nav><div className="header-tools"><span className="network-label"><span aria-hidden="true" />{runtime.chain.name}</span><Wallet /></div></header>
    <main id="main-content" tabIndex={-1}>{verification.isError && <div className="verification-error"><Notice error>Contract verification failed. Transactions are disabled. {explain(verification.error)} <button className="text-button" onClick={() => void verification.refetch()}>Retry verification</button></Notice></div>}{route === '/' ? <Home /> : route === '/create' ? <Create /> : route === '/tokens' ? <div className="page"><div className="page-heading"><h1>Collected by you.</h1><p>Every token has a place.</p></div><Collections owned /></div> : route === '/trade' ? <Trade /> : collectionAddress && isAddress(collectionAddress) ? <CollectionPage key={collectionAddress.toLowerCase()} address={collectionAddress} /> : <div className="page"><h1>Page not found.</h1><a className="button" href="#/">Explore collections</a></div>}</main>
    <footer className="site-footer"><div className="footer-top"><a className="brand" href="#/"><Mark /><span>loom</span></a><p>Made of many threads.</p><span>{runtime.deployment.network.name} testnet</span></div><details><summary>Network & contracts</summary><p className="hint">Read from the attested deployment. This release uses test ETH; no USD price source is configured.</p>{runtime.deployment.contracts.map(c => <AddressView key={c.name} address={c.address} label={c.name === 'LoomCollection' ? 'Collection implementation (not a mint page)' : c.name} />)}<p className="hint address">Source commit: {runtime.deployment.sourceCommit}</p><a href="./imd-deployment.json" target="_blank" rel="noreferrer">View deployment manifest</a><div className="faucet-links">{runtime.deployment.network.faucets.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer">Sepolia faucet {i + 1} ↗</a>)}</div></details><TransactionStatus /></footer>
  </>;
}
export default function App() { return <TransactionProvider><Shell /></TransactionProvider>; }
