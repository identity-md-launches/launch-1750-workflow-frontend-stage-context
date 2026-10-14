import { createConfig, fallback, http } from 'wagmi';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { createPublicClient, custom, defineChain, getAddress, isAddress, keccak256, stringToHex, type Abi, type Address, type EIP1193Provider, type Hex } from 'viem';

export type ContractName = 'LaunchToken' | 'LoomCollection' | 'LoomFactory';
export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
export type Deployment = {
  version: 1; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: ContractName; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[];
    uniswapV4: { poolManager: Address; universalRouter: Address; quoter: Address; stateView: Address; positionManager: Address; permit2: Address; extendedSwapParams?: boolean };
  };
  walletAddChain?: { chainId: Hex; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };
};

export const canonical = (value: unknown): string => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

export function safeAssetPath(path: string) {
  return !!path && !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && !path.split('/').some(p => p === '..' || p === '.' || !p) && !/[?#%]/.test(path);
}

async function jsonAt(path: string) {
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${path}. Reload to try again.`);
  return response.json();
}

export async function loadRuntime() {
  const deployment = await jsonAt('./imd-deployment.json') as Deployment;
  const allowed = ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash', 'contracts', 'assets', 'poolKey', 'network', 'walletAddChain'];
  if (Object.keys(deployment).some(k => !allowed.includes(k)) || deployment.version !== 1 || deployment.network?.chainId !== deployment.chainId || !deployment.network.rpcUrls.length) throw new Error('Deployment configuration is invalid. Transactions are unavailable.');
  const contracts = {} as Record<ContractName, { address: Address; abi: Abi }>;
  for (const contract of deployment.contracts) {
    if (!safeAssetPath(contract.abiPath) || !isAddress(contract.address) || contracts[contract.name]) throw new Error('Invalid contract configuration.');
    const abi = await jsonAt(contract.abiPath) as Abi;
    if (!Array.isArray(abi) || keccak256(stringToHex(canonical(abi))).slice(2) !== contract.abiHash) throw new Error(`The ${contract.name} ABI does not match its attestation. Transactions are unavailable.`);
    contracts[contract.name] = { address: getAddress(contract.address), abi };
  }
  if (!contracts.LoomFactory || !contracts.LoomCollection || !contracts.LaunchToken || deployment.contracts.length !== 3) throw new Error('The Loom deployment is incomplete.');
  const chain = defineChain({ id: deployment.chainId, name: deployment.network.name, nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: deployment.network.explorer } }, testnet: deployment.network.testnet });
  let walletProvider: EIP1193Provider | undefined;
  const transport = fallback([
    ...deployment.network.rpcUrls.map(url => http(url, { timeout: 8000, retryCount: 0, batch: { wait: 20 } })),
    custom({ request: async ({ method, params }) => {
      if (!walletProvider) throw new Error('Public RPCs are unavailable. Connect a wallet on the correct network or retry.');
      const id = await walletProvider.request({ method: 'eth_chainId' });
      if (Number(id) !== chain.id) throw new Error('Switch the wallet network to use its RPC.');
      return walletProvider.request({ method, params } as Parameters<EIP1193Provider['request']>[0]);
    } }, { retryCount: 0 }),
  ], { retryCount: 0 });
  const client = createPublicClient({ chain, transport });
  const walletConfig = createConfig({ chains: [chain], multiInjectedProviderDiscovery: true,
    connectors: [injected(), coinbaseWallet({ appName: 'Loom', preference: { options: 'all' } })],
    transports: { [chain.id]: transport } });
  return { deployment, chain, contracts, client, walletConfig, setWalletProvider: (provider?: EIP1193Provider) => { walletProvider = provider; } };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;

export async function verifyDeployment(runtime: Runtime) {
  const { client, deployment, contracts } = runtime;
  if (await client.getChainId() !== deployment.chainId) throw new Error('RPC chain does not match the deployment.');
  for (const contract of deployment.contracts) {
    const code = await client.getCode({ address: contract.address });
    if (!code || code === '0x') throw new Error(`No deployed code found for ${contract.name}.`);
  }
  const implementation = await client.readContract({ ...contracts.LoomFactory, functionName: 'implementation' }) as Address;
  if (implementation.toLowerCase() !== contracts.LoomCollection.address.toLowerCase()) throw new Error('Factory implementation does not match the attested collection.');
  return true;
}

export async function verifyCollection(runtime: Runtime, address: Address) {
  const { client, contracts } = runtime;
  const registered = await client.readContract({ ...contracts.LoomFactory, functionName: 'isCollection', args: [address] });
  if (!registered) throw new Error('This address is not a collection registered by the Loom factory.');
  const code = await client.getCode({ address });
  const expected = `0x363d3d373d3d3d363d73${contracts.LoomCollection.address.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  if (code?.toLowerCase() !== expected) throw new Error('This collection does not use the attested Loom implementation.');
  return true;
}
