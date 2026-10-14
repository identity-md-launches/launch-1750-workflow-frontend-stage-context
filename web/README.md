# Loom frontend

Loom is a static React + TypeScript application for the attested Sepolia deployment. It creates collections through `LoomFactory`, lists factory collections, mints with exact native-ETH payments, shows the connected wallet’s tokens, and exposes collection-owner settings. A separate trade page uses the attested LOOM / native-ETH Uniswap v4 pool.

## Install, build and preview

Use Node 24 and npm. From `web/`:

```sh
npm ci
npm run typecheck
npm run build
npm run verify
npm run preview
```

The production export is `../dist/`. `npm run build` runs TypeScript, Vite with `base: './'`, and the manifest exporter. Serve the **entire** directory as static files. Hash routes support gateway subpaths without server rewrites. An HTTP server is required; opening `index.html` as a `file:` URL cannot load JSON configuration.

`npm run dev` first prepares the same deployment and ABI files, then starts Vite with hot reload. Its development middleware serves those files from `dist/`; it does not create a second configuration. For a production subpath preview, run `node scripts/serve.mjs` and open `http://127.0.0.1:4173/preview/`.

On a machine with a read-only default npm cache, use `npm ci --cache /tmp/loom-npm-cache`. Neither dependencies nor caches belong in the submission. `web/.gitignore` is the assignment’s explicitly permitted ignore file and excludes dependency/cache/test-output directories at every nesting level under `web/`.

## Deployment configuration

The production app fetches `dist/imd-deployment.json`, then the ABI files referenced by its contract entries. `src/config.ts` creates the chain, RPC transports, wallet connectors and contract handles from that file. There is no independent runtime address, chain-ID or implementation-ABI map.

`deployment-handoff.json` and `network-handoff.json` are unchanged copies of the assignment inputs, retained as **build inputs**, not imported into the browser application. Do not substitute guessed addresses. The build reads each ABI with:

```text
git show <handoff.sourceCommit>:docs/abi/<Contract>.json
```

The pinned commit must therefore be available in the repository history. The exporter checks the canonical Keccak-256 ABI hash against the handoff, copies the raw ABI array, copies all deployment identifiers and the exact contract set, and preserves `poolKey`, `network` and `walletAddChain`. It inventories every exported file except the manifest itself, using lowercase SHA-256 hashes. The manifest has no extra top-level fields.

`scripts/verify.mjs` verifies the complete asset inventory, safe relative paths, all SHA-256 and ABI hashes, exact handoff/network equality, asset-count limit, individual-file limit and HTTP body budget. Any export change requires rerunning the build or `node scripts/export.mjs`. Do not edit `dist/` by hand.

At runtime, Loom checks ABI hashes, RPC chain ID, nonempty code for all three deployed contracts and the factory’s implementation pointer. Collection pages additionally check factory registration and the exact EIP-1167 runtime pointing at the attested implementation. Transaction signing repeats deployment verification and wallet account/chain checks. The attestation itself is checked by the publication service; the browser does not independently authenticate an altered manifest against an external trust root.

## Wallets and transactions

- Desktop: EIP-6963 discovery lists installed wallets by name and icon. The generic connector only appears when no named wallet is discovered.
- Mobile: MetaMask, Coinbase Wallet, Rabby and Phantom links open the current page in the wallet browser. Coinbase Smart Wallet is available without a relay/project ID.
- Connection requests a chain switch when needed. Unknown-chain errors trigger `wallet_addEthereumChain` with the supplied parameters, then another switch. The header always offers the recovery action.
- Writes simulate first, estimate gas, check payment plus a 20% gas-limit buffer, verify the wallet again, and then ask it to sign. Each action has its own status; one global lock prevents overlapping writes. Buttons remain locked through receipt confirmation **and** refreshed reads.
- A hash with uncertain confirmation keeps the write lock and offers “Check confirmation.” Explorer links remain visible. Cancellation/replacement is not reported as successful completion of the original action. Activity is in memory for the current tab; after a reload, consult the wallet/explorer before resubmitting an unconfirmed transaction.
- Public RPCs are tried in the supplied order, with a connected provider fallback only on the correct chain. Factory/collection/balance reads refresh every 20 seconds, allowances every 15 seconds, and relevant queries refresh after confirmed writes. These read-only polling timers do not submit transactions.

On reload, the wallet fallback waits for Wagmi's `connected` status and a resolved connector. Reconnecting, disconnected and wrong-chain states clear the fallback; provider failures stay in the wallet error UI. “Check confirmation” is a read-only button, including when the transaction status appears inside a paid form.

No private credentials or signing keys are required or included. Wallets perform all real signing. There is no WalletConnect relay integration and no project ID.

## Collection behavior

Creation uses the live `CREATE_FEE()` value. The form defaults to a creator price of `0` and royalty of `5%` (500 basis points). Supply/cap/price validation uses integer arithmetic. The creator defaults to the connected wallet, with an explicit alternate-recipient field. The caller becomes owner.

Both public and owner-reserve mints use `(mintPriceWei() + PLATFORM_FEE()) * quantity`, with bigint arithmetic and no overpayment. Public mints enforce lifetime wallet allowance and remaining supply. Reserve mints enforce `floor(maxSupply / 100) - reserveMinted` and the shared supply cap. The UI explains that the fixed 0.0005 ETH fee splits 40% creator / 40% platform / 20% reserve, and that creator royalties are separate and marketplace-enforced.

Metadata starts empty. The collection page says when metadata is unset or awaiting reveal. The owner studio exposes pause/resume, reserve minting, provenance, unrevealed URI, reveal seed, base URI, irreversible metadata freeze, ownership proposal/acceptance and renunciation. Irreversible operations have explicit confirmations. The factory pauser sees separate creation-pause controls. Art generation, metadata hosting/pinning and seed generation are off-chain responsibilities; this UI does not claim to produce them.

The factory list reads 12 entries per page, below the contract’s 100-entry maximum. This ERC-721 implementation has consecutive token IDs and no burns. To avoid a backend/indexer and unbounded historical-log scans, token discovery checks `ownerOf` in **50-ID pages** at a fixed block snapshot and then reads `tokenURI` for owned IDs. It does not confuse lifetime mints with current holdings. “Check next 50 token IDs” continues the scan; the interface states its checked range and snapshot block. `balanceOf` shows the current balance independently. Refresh resnapshots ownership; confirmed local transactions invalidate the token queries. This is deliberately bounded and can take multiple pages for a large collection.

Metadata links accept HTTPS or IPFS only. IPFS links open through the public `ipfs.io` gateway. Token metadata/images are not bundled with the site. The token shelf shows token IDs and metadata links, rather than unverified or invented artwork.

## LOOM trading

All router, quoter, state-view and Permit2 addresses come from the runtime manifest’s unchanged network block. All five pool-key fields come from its unchanged `poolKey`, including the nonzero hook. Quotes call `quoteExactInputSingle` through `simulateContract`, never a transaction. The UI reads token decimals, shows expected/minimum output, slippage and exchange rate, and expires quotes after 60 seconds.

The router uses command `0x10`, actions `0x060c0f`, `SETTLE_ALL` and `TAKE_ALL`. The encoder also handles `extendedSwapParams` if specified by the network. Native buys send exactly the input ETH and do not approve anything. Sells separately approve the token to Permit2 and authorize the configured router in Permit2, only when the live allowance is insufficient. Both authorize the exact amount; router allowance expires after one hour. Router execution is simulated before signing and has a three-minute deadline. The UI restricts slippage to 0–5% and rejects amounts outside the protocol’s uint128 limit.

The worker’s live read found **zero active pool liquidity**, so the current live trade UI correctly disables quotes/swaps with an explanation. Mocked interaction tests exercise both directions; no funded swap was broadcast. USD pricing is explicitly unavailable because this assignment supplies no price source.

## Validation

```sh
npm test
npx playwright install chromium webkit
npm run test:browser
node tests/revision.mjs
node scripts/check-live.mjs
```

The browser script owns a temporary HTTP preview under `/preview/`, mocks only wallet/RPC operations, and tests the **production export** in Chromium and WebKit. It writes JSON reports and screenshots to `docs/frontend-evidence/`. Test-only fixtures are under `web/tests/` and are not in the Vite import graph or static export. No mock keys or real transaction broadcasts are used. Chromium may use `CHROMIUM_PATH`; Playwright honors `PLAYWRIGHT_BROWSERS_PATH` for installed browsers. A normal Linux runner needs Playwright’s browser system dependencies.

`tests/revision.mjs` checks persisted-wallet reloads on all five routes and receipt-timeout recovery for creation/minting in both browsers. It advances Playwright's clock by 121 seconds without waiting in real time and asserts that receipt checking sends no second transaction. Its `--baseline` mode expects the reported defects and is only for the original, unrepaired export; the saved before/after reports identify the manifest bytes tested. `npm test` also exercises the wallet fallback effect with unresolved connectors, provider failures and late completions.

The pinned design probe (available only during the worker assignment) runs from repository root:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
  node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

See [validation evidence](../docs/FRONTEND-VALIDATION.md), [implemented design](../docs/DESIGN.md), and [attribution](../docs/FRONTEND-ATTRIBUTION.md). The required root `DESIGN.md` was relocated to `docs/DESIGN.md` because the assignment’s higher-priority write budget forbids root-file changes.

The publisher handles source publication, IPFS pinning, naming and final hosted validation. Those actions are not part of this worker. No contracts were changed or redeployed.
