import { encodeAbiParameters, keccak256, parseAbi, type Address, type Hex } from 'viem';
import type { PoolKey } from './config';

// Protocol interfaces only; every protocol address comes from the runtime network block.
export const poolComponents = [ { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' } ] as const;
export const quoterAbi = parseAbi(['struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }', 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }', 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)']);
export const routerAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
export const permit2Abi = parseAbi(['function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)', 'function approve(address token, address spender, uint160 amount, uint48 expiration)']);
export const stateViewAbi = parseAbi(['function getLiquidity(bytes32 poolId) view returns (uint128)', 'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)']);
export function poolId(key: PoolKey) { return keccak256(encodeAbiParameters([{ type: 'tuple', components: poolComponents }], [key])); }
export function swapInput(key: PoolKey, inputCurrency: Address, amountIn: bigint, minimum: bigint, extended: boolean) {
  const zeroForOne = inputCurrency.toLowerCase() === key.currency0.toLowerCase();
  const outputCurrency = zeroForOne ? key.currency1 : key.currency0;
  const common = [{ name: 'poolKey', type: 'tuple', components: poolComponents }, { name: 'zeroForOne', type: 'bool' }, { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' }] as const;
  const components = extended ? [...common, { name: 'minHopPriceX36', type: 'uint256' }, { name: 'hookData', type: 'bytes' }] as const : [...common, { name: 'hookData', type: 'bytes' }] as const;
  const params = [
    encodeAbiParameters([{ type: 'tuple', components }], [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minimum, minHopPriceX36: 0n, hookData: '0x' }]),
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [inputCurrency, amountIn]),
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [outputCurrency, minimum]),
  ];
  return encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], ['0x060c0f', params]) as Hex;
}
