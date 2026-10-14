import { BaseError, ContractFunctionRevertedError, formatEther, getAddress, isAddress, maxUint256, parseUnits, type Address } from 'viem';

export const shortAddress = (a: string) => `${getAddress(a).slice(0, 6)}…${a.slice(-4)}`;
export const eth = (wei: bigint) => formatEther(wei);
export const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function uint(value: string, label = 'Quantity', zero = false) {
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be a whole number.`);
  const n = BigInt(value);
  if ((!zero && n === 0n) || n > maxUint256) throw new Error(`${label} must be ${zero ? 'zero or ' : ''}a positive uint256 value.`);
  return n;
}
export function amount(value: string, decimals = 18, zero = false) {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(value)) throw new Error(`Use a decimal amount with at most ${decimals} decimal places.`);
  const n = parseUnits(value, decimals);
  if ((!zero && n === 0n) || n > maxUint256) throw new Error('Enter a valid positive amount.');
  return n;
}
export function recipient(value: string): Address {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error('Enter a valid, nonzero Ethereum address.');
  return getAddress(value);
}
export const errorMessages: Record<string, string> = {
  IncorrectPayment: 'The mint fee changed or the payment is incorrect. Refresh the collection and try again.',
  IncorrectCreateFee: 'The creation payment is incorrect. Refresh and try again.',
  WalletCapExceeded: 'This quantity exceeds your remaining lifetime mint allowance.',
  SupplyCapExceeded: 'This quantity exceeds the remaining collection supply. Refresh and lower the quantity.',
  ReserveCapExceeded: 'This quantity exceeds the remaining owner reserve allowance.',
  EnforcedPause: 'This action is paused. Wait for the owner to resume it.',
  MetadataIsFrozen: 'Metadata is permanently frozen. It cannot be changed.',
  ProvenanceAlreadySet: 'Provenance has already been recorded and cannot be replaced.',
  MintingAlreadyStarted: 'Provenance can only be set before the first mint.',
  RevealSeedAlreadySet: 'The reveal seed has already been recorded.',
  ETHTransferFailed: 'A fee recipient could not receive ETH. The transaction cannot proceed.',
  OwnableUnauthorizedAccount: 'Only the collection owner can do this. Connect the owner wallet.',
  UnauthorizedPauser: 'Only the factory pauser can do this.',
  RoyaltyTooHigh: 'Choose a royalty from 0% to 10%.',
  EmptyNameOrSymbol: 'Enter a collection name and symbol.',
  InvalidSupplyOrWalletCap: 'Supply must be positive and the wallet cap must be within supply.',
};
export function explain(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk(e => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError;
    const name = reverted?.data?.errorName;
    if (name) return errorMessages[name] ?? `The contract rejected this action (${name}). Refresh and check the inputs.`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|4001|rejected the request/i.test(message)) return 'Request declined in your wallet. Nothing was submitted. You can try again.';
  if (/insufficient funds/i.test(message)) return 'Your wallet needs more Sepolia ETH for the payment and gas.';
  if (/provider not found|provider is not defined|no injected/i.test(message)) return 'No browser wallet was found. Install a wallet or choose Coinbase Wallet.';
  if (/timeout|timed out/i.test(message)) return 'The network took too long to respond. Check the transaction link before retrying.';
  if (/failed to fetch|http request failed|rpc request failed/i.test(message)) return 'Could not reach the network. Check your connection and retry.';
  return message.split('\n')[0].slice(0, 300);
}

export function externalUri(uri: string) {
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7).replace(/^ipfs\//, '')}`;
  try { const url = new URL(uri); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
}
