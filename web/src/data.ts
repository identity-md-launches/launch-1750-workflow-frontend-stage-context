import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import { type Address } from 'viem';
import { useRuntime } from './context';
import { verifyCollection, verifyDeployment, type Runtime } from './config';

export function useDeploymentCheck() {
  const runtime = useRuntime();
  return useQuery({ queryKey: ['verification'], queryFn: () => verifyDeployment(runtime), staleTime: 60_000, retry: 1 });
}
export function useFactory() {
  const { client, contracts } = useRuntime();
  return useQuery({ queryKey: ['factory'], queryFn: async () => {
    const blockNumber = await client.getBlockNumber();
    const read = (functionName: string) => client.readContract({ ...contracts.LoomFactory, functionName, blockNumber });
    const [count, fee, paused, pauser, platform] = await Promise.all(['collectionCount', 'CREATE_FEE', 'paused', 'pauser', 'PLATFORM'].map(read));
    return { count: count as bigint, fee: fee as bigint, paused: paused as boolean, pauser: pauser as Address, platform: platform as Address, blockNumber };
  }, refetchInterval: 20_000, retry: 1 });
}
export function useCollectionAddresses(page: number) {
  const { client, contracts } = useRuntime();
  return useQuery({ queryKey: ['collections', page], queryFn: () => client.readContract({ ...contracts.LoomFactory, functionName: 'getCollections', args: [BigInt(page * 12), 12n] }) as Promise<Address[]>, refetchInterval: 20_000 });
}
export type Collection = {
  name: string; symbol: string; maxSupply: bigint; mintPriceWei: bigint; maxPerWallet: bigint; totalSupply: bigint; PLATFORM_FEE: bigint;
  creator: Address; owner: Address; pendingOwner: Address; royaltyBps: bigint; paused: boolean; baseURI: string; unrevealedURI: string;
  metadataFrozen: boolean; provenanceHash: string; provenanceSet: boolean; revealSeed: string; revealSeedSet: boolean; reserveMinted: bigint;
  balance: bigint; minted: bigint; blockNumber: bigint;
};
export async function readCollection(runtime: Runtime, address: Address, wallet?: Address): Promise<Collection> {
  await verifyCollection(runtime, address);
  const blockNumber = await runtime.client.getBlockNumber();
  const fields = ['name', 'symbol', 'maxSupply', 'mintPriceWei', 'maxPerWallet', 'totalSupply', 'PLATFORM_FEE', 'creator', 'owner', 'pendingOwner', 'royaltyBps', 'paused', 'baseURI', 'unrevealedURI', 'metadataFrozen', 'provenanceHash', 'provenanceSet', 'revealSeed', 'revealSeedSet', 'reserveMinted'];
  const read = (functionName: string, args?: readonly unknown[]) => runtime.client.readContract({ address, abi: runtime.contracts.LoomCollection.abi, functionName, args, blockNumber });
  const values = await Promise.all(fields.map(f => read(f)));
  const [balance, minted] = wallet ? await Promise.all([read('balanceOf', [wallet]), read('mintedPerWallet', [wallet])]) : [0n, 0n];
  return { ...Object.fromEntries(fields.map((f, i) => [f, values[i]])), balance, minted, blockNumber } as Collection;
}
export function useCollection(address: Address) {
  const runtime = useRuntime();
  const { address: wallet } = useConnection();
  return useQuery({ queryKey: ['collection', address.toLowerCase(), wallet], queryFn: () => readCollection(runtime, address, wallet), refetchInterval: 20_000, retry: 1 });
}
export function useBalances() {
  const { address } = useConnection();
  const { client, contracts } = useRuntime();
  return useQuery({ queryKey: ['balances', address], enabled: !!address, queryFn: async () => {
    const [native, token, decimals, symbol] = await Promise.all([
      client.getBalance({ address: address! }),
      client.readContract({ ...contracts.LaunchToken, functionName: 'balanceOf', args: [address!] }) as Promise<bigint>,
      client.readContract({ ...contracts.LaunchToken, functionName: 'decimals' }) as Promise<number>,
      client.readContract({ ...contracts.LaunchToken, functionName: 'symbol' }) as Promise<string>,
    ]);
    return { native, token, decimals, symbol };
  }, refetchInterval: 20_000, retry: 1 });
}
