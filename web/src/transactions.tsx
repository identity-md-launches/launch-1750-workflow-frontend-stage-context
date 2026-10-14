import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useConnection } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { createWalletClient, custom, type Abi, type Address, type EIP1193Provider, type Hash, type TransactionReceipt } from 'viem';
import { useRuntime } from './context';
import { verifyDeployment } from './config';
import { explain, sameAddress } from './utils';

type Tx = { id: string; label: string; phase: 'preparing' | 'signing' | 'confirming' | 'refreshing' | 'unknown' | 'success' | 'error'; hash?: Hash; error?: string };
type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
type TransactionContextValue = { transactions: Tx[]; busy: boolean; execute: (id: string, label: string, call: Call, onSuccess?: (receipt: TransactionReceipt) => void) => Promise<TransactionReceipt | undefined>; check: (tx: Tx) => Promise<void> };
const TransactionContext = createContext<TransactionContextValue | null>(null);

export function TransactionProvider({ children }: { children: ReactNode }) {
  const runtime = useRuntime(); const { address, connector, chainId } = useConnection(); const query = useQueryClient();
  const [transactions, setTransactions] = useState<Tx[]>([]); const lock = useRef(false);
  const update = (tx: Tx) => setTransactions(list => [tx, ...list.filter(t => t.id !== tx.id)].slice(0, 6));
  const execute: TransactionContextValue['execute'] = async (id, label, call, onSuccess) => {
    if (lock.current) return;
    lock.current = true;
    const tx: Tx = { id, label, phase: 'preparing' }; update({ ...tx });
    try {
      if (!address || !connector) throw new Error('Connect your wallet using the button above.');
      if (chainId !== runtime.chain.id) throw new Error(`Switch your wallet to ${runtime.chain.name}.`);
      const provider = await connector.getProvider() as EIP1193Provider;
      const validateWallet = async () => {
        if (Number(await provider.request({ method: 'eth_chainId' })) !== runtime.chain.id) throw new Error('The wallet network changed. Switch back before trying again.');
        const accounts = await provider.request({ method: 'eth_accounts' });
        if (!sameAddress(accounts[0], address)) throw new Error('The wallet account changed. Review the action again.');
      };
      await validateWallet(); await verifyDeployment(runtime);
      const { request } = await runtime.client.simulateContract({ ...call, account: address });
      const [gas, gasPrice, balance] = await Promise.all([runtime.client.estimateContractGas({ ...call, account: address }), runtime.client.getGasPrice(), runtime.client.getBalance({ address })]);
      const gasLimit = gas + gas / 5n;
      if (balance < (call.value ?? 0n) + gasLimit * gasPrice) throw new Error('Your wallet needs more Sepolia ETH for the payment and estimated gas.');
      await validateWallet();
      tx.phase = 'signing'; update({ ...tx });
      const wallet = createWalletClient({ account: address, chain: runtime.chain, transport: custom(provider) });
      tx.hash = await wallet.writeContract({ ...request, gas: gasLimit });
      tx.phase = 'confirming'; update({ ...tx });
      const receipt = await runtime.client.waitForTransactionReceipt({ hash: tx.hash, confirmations: 1, timeout: 120_000,
        onReplaced: replacement => { tx.hash = replacement.transaction.hash; update({ ...tx }); if (replacement.reason === 'cancelled') tx.error = 'Transaction cancelled in your wallet.'; else if (replacement.reason === 'replaced') tx.error = 'Transaction replaced in your wallet. Review the receipt; the original action was not confirmed.'; } });
      if (receipt.status !== 'success' || tx.error) throw new Error(tx.error ?? 'The transaction reverted. No action was completed.');
      tx.phase = 'refreshing'; update({ ...tx });
      await query.invalidateQueries();
      tx.phase = 'success'; update({ ...tx }); onSuccess?.(receipt); return receipt;
    } catch (e) {
      tx.error = explain(e);
      tx.phase = tx.hash && !/transaction reverted|transaction cancelled|transaction replaced/i.test(tx.error) ? 'unknown' : 'error';
      update({ ...tx });
    } finally { lock.current = tx.phase === 'unknown'; }
  };
  const check = async (tx: Tx) => {
    if (!tx.hash) return;
    try {
      const receipt = await runtime.client.getTransactionReceipt({ hash: tx.hash });
      update({ ...tx, phase: receipt.status === 'success' ? 'success' : 'error', error: receipt.status === 'success' ? undefined : 'Transaction reverted.' });
      lock.current = false; await query.invalidateQueries();
    } catch { update({ ...tx, error: 'Confirmation is still unknown. Check the explorer and try checking again.' }); }
  };
  const busy = transactions.some(t => ['preparing','signing','confirming','refreshing','unknown'].includes(t.phase));
  return <TransactionContext.Provider value={{ transactions, busy, execute, check }}>{children}</TransactionContext.Provider>;
}
export function useTransactions() { return useContext(TransactionContext)!; }
export function useTransaction(id: string) {
  const context = useTransactions(); const tx = context.transactions.find(t => t.id === id);
  return { ...context, tx, pending: !!tx && ['preparing','signing','confirming','refreshing','unknown'].includes(tx.phase), run: (label: string, call: Call, onSuccess?: (receipt: TransactionReceipt) => void) => context.execute(id, label, call, onSuccess) };
}
export function TransactionStatus({ id }: { id?: string }) {
  const { transactions, check } = useTransactions(); const { deployment } = useRuntime();
  const tx = id ? transactions.find(t => t.id === id) : transactions[0];
  const labels = { preparing: 'Checking transaction…', signing: 'Confirm in your wallet…', confirming: 'Waiting for confirmation…', refreshing: 'Confirmed; updating state…', unknown: 'Confirmation not yet known', success: 'Confirmed', error: 'Could not complete' };
  return <div className="transaction-status" role="status" aria-live="polite">{tx && <><strong>{tx.label}: {labels[tx.phase]}</strong>{tx.error && <p className="error-text">{tx.error}</p>}{tx.hash && <a href={`${deployment.network.explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}{tx.phase === 'unknown' && <button type="button" className="button" onClick={() => void check(tx)}>Check confirmation</button>}</>}</div>;
}
