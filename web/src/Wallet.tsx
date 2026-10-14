import { useEffect, useState } from 'react';
import { useConnection, useConnect, useDisconnect, type Connector } from 'wagmi';
import { numberToHex, type EIP1193Provider } from 'viem';
import { useRuntime } from './context';
import { Modal, AddressView, Notice } from './ui';
import { explain, shortAddress } from './utils';
import { OPEN_IN, isMobileBrowser } from './open-in';

export async function switchNetwork(provider: EIP1193Provider, chainId: number, walletAddChain: unknown) {
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chainId) }] }); }
  catch (error) {
    const e = error as { code?: number; message?: string; cause?: { code?: number }; data?: { originalError?: { code?: number } } };
    const unknownChain = e.code === 4902 || e.cause?.code === 4902 || e.data?.originalError?.code === 4902 || /unknown chain|unrecognized chain|chain.*not.*added/i.test(e.message ?? '');
    if (!unknownChain || !walletAddChain) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [walletAddChain] } as Parameters<EIP1193Provider['request']>[0]);
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chainId) }] });
  }
}

export function Wallet() {
  const runtime = useRuntime();
  const { address, chainId, isConnected, connector, status } = useConnection();
  const { connectors, mutateAsync: connect, isPending, variables } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const [open, setOpen] = useState(false); const [error, setError] = useState(''); const [switching, setSwitching] = useState(false);
  const named = connectors.some(c => c.type === 'injected' && c.id !== 'injected');
  const mobile = isMobileBrowser() && !named;
  const wrong = isConnected && chainId !== runtime.chain.id;
  useEffect(() => {
    let active = true;
    runtime.setWalletProvider();
    // isConnected can be true while Wagmi restores a serialized connector.
    if (status === 'connected' && typeof connector?.getProvider === 'function' && !wrong) {
      void (async () => {
        try {
          const provider = await connector.getProvider();
          if (active) runtime.setWalletProvider(provider as EIP1193Provider);
        } catch {
          if (active) setError('Could not access your wallet. Disconnect and reconnect to try again.');
        }
      })();
    }
    return () => { active = false; runtime.setWalletProvider(); };
  }, [status, connector, wrong, runtime]);
  const changeChain = async (provider?: EIP1193Provider) => {
    setSwitching(true); setError('');
    try { await switchNetwork(provider ?? await connector!.getProvider() as EIP1193Provider, runtime.chain.id, runtime.deployment.walletAddChain); }
    catch (e) { setError(explain(e)); }
    finally { setSwitching(false); }
  };
  const choose = async (c: Connector) => {
    setError('');
    try { const result = await connect({ connector: c }); setOpen(false); if (result.chainId !== runtime.chain.id) await changeChain(await c.getProvider() as EIP1193Provider); }
    catch (e) { setError(explain(e)); }
  };
  const listed = [...connectors.filter(c => c.type === 'injected'), ...connectors.filter(c => c.type !== 'injected')].filter(c => !(c.id === 'injected' && named) && (!mobile || c.type !== 'injected'));
  return <div className="wallet-control">
    <button className="button wallet-button" onClick={() => wrong ? void changeChain() : setOpen(true)} disabled={switching}>{switching ? 'Switching…' : wrong ? `Switch to ${runtime.chain.name}` : address ? shortAddress(address) : 'Connect wallet'}{!wrong && !address && <span className="wallet-dot" aria-hidden="true" />}</button>
    {error && !open && <div className="wallet-error" role="alert">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
    {open && <Modal title={isConnected ? 'Your wallet' : 'Connect a wallet'} onClose={() => setOpen(false)}>
      {isConnected && address ? <><AddressView address={address} /><p>Connected to {wrong ? 'a different network' : runtime.chain.name}.</p><button className="button full" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button></> : <>
        {mobile && OPEN_IN.map(w => <a className="wallet-row" href={w.href(location.href)} key={w.id}><img src={`./wallets/${w.id}.svg`} width="28" height="28" alt="" /><span>Open in {w.name}</span></a>)}
        {listed.map(c => <button className="wallet-row" disabled={isPending} onClick={() => void choose(c)} key={c.uid}>
          <img alt="" width="28" height="28" src={c.icon ?? (c.id === 'coinbaseWalletSDK' ? './wallets/coinbase.svg' : './wallets/browser.svg')} />
          <span>{c.id === 'injected' ? 'Browser wallet' : c.id === 'coinbaseWalletSDK' && mobile ? 'Coinbase Smart Wallet' : c.name}{isPending && variables?.connector === c ? ' · opening…' : ''}</span>
        </button>)}
        {error && <Notice error>{error}</Notice>}
        <p className="hint">Connecting lets Loom read your address. Every transaction needs your confirmation.</p>
      </>}
    </Modal>}
  </div>;
}
