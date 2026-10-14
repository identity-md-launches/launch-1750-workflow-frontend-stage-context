# Loom frontend validation

Worker validation on **2026-10-14**. Status: **Complete for the assigned frontend file-delivery scope**, with the path exception and unperformed checks below. These are the worker’s own observations, not independent certification or publication approval.

## Result

| Area | Final result |
| --- | --- |
| Build and strict TypeScript | Passed |
| Pinned implementation ABI hashes | 3 / 3 match |
| Manifest/network/pool binding and asset SHA-256 | Passed |
| Unit/integrity/encoding tests | 4 / 4 passed |
| Production-export browser interaction groups | 32 / 32 passed: 16 each in Chromium and WebKit |
| Accessibility scans on populated collection state | 0 violations, 28 rules passed in each engine |
| taste@1 design probe | 16 / 16 checks passed |
| Product and main action at 390 × 844 | Yes: home creation action and collection mint action |
| Horizontal overflow | None at 320, 390, 768 or 1440 in tested states; 200% text enlargement also checked |
| Runtime script errors in interaction suite | 0 |
| Real transactions broadcast by worker | 0 |
| Export | 15 declared assets; 873,771 asset bytes + 4,621 manifest bytes = **878,392 bytes** |
| Complete Git bundle size check | 1,696,218 bytes measured; conservative final bound **1,761,754 bytes**, below 8,388,608 bytes |

The supplied deployment is pinned to source `586668b09578a70919bf1f57fe7224dcfa9bee69`, launch `5a236d96-2876-4ac5-b874-ee97565f17f6`, chain 11155111, attestation `9a2610c0dbbad95f0ec65f4f9db3743701a084d131b369d4d44efc9a1f929e1a`. The contracts and root build files were preserved.

The assignment asks for root `DESIGN.md` but its overriding path budget permits only `web/**`, `dist/**`, `docs/**` and `web/.gitignore`. The implemented design document is therefore **`docs/DESIGN.md`**. No root file was created to evade that restriction. The workspace also marks root `.git` metadata read-only; the worker prepares source/export/evidence for the submission service rather than claiming an in-place Git commit it cannot create.

## Scope and consequential choices

Reviewed pages: live empty registry/home, populated collection list, creation form, collection mint page, token shelf, owner studio, trade page, wallet sheet, contract details, unavailable reads, missing deployment code and invalid ABI. The visual direction is a paper-and-ink collection studio with a woven SVG; no fake collection records, random counters or pretend NFT artwork appear in the production app.

The handoff includes a token and pool, so the site includes a separate LOOM trade page. Creating and minting collections use only native ETH. The actual pool has no active liquidity at the recorded block; trading is disabled for that condition, while mock tests cover the otherwise-ready trade flows. No liquidity-management or backend/indexer feature was invented.

Token enumeration uses the implementation’s consecutive, non-burnable IDs: `ownerOf` checks in bounded 50-ID pages at one block snapshot, with `tokenURI` reads for held IDs. The checked range, partial-scan continuation, snapshot block and independently read current balance are visible. This avoids treating minted count as current ownership or claiming a partial scan is a complete portfolio. Factory browsing uses 12-address pages.

## Commands and evidence

From `web/`, successful exit codes were observed for:

```sh
npm run typecheck
npm run build
npm run verify
npm test
npm run test:browser
node scripts/check-live.mjs
```

`npm run build` itself invokes typecheck, Vite and the manifest exporter/validator. The development server was also smoke-tested for HTML, `imd-deployment.json` and its referenced ABI under Vite. The production test server was served beneath `/preview/`, verifying relative resources and hash navigation.

The worker installed Playwright browsers under `/tmp/loom-browsers`. Chromium was **156.0.8078.4**, WebKit **27.2**. This restricted machine lacked WebKit’s shared libraries and software EGL vendor setup. The libraries were downloaded/extracted under `/tmp/loom-webkit-deps`; the temporary WebKit wrapper was pointed at those libraries. Software Mesa/EGL and the headless runner’s sandbox override were used. No system or repository build configuration was changed. The final interaction invocation was:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
PLAYWRIGHT_BROWSERS_PATH=/tmp/loom-browsers \
WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 \
__EGL_VENDOR_LIBRARY_FILENAMES=/tmp/loom-webkit-deps/root/usr/share/glvnd/egl_vendor.d/50_mesa.json \
LIBGL_DRIVERS_PATH=/tmp/loom-webkit-deps/root/usr/lib/x86_64-linux-gnu/dri \
LIBGL_ALWAYS_SOFTWARE=1 npm run test:browser
```

These flags only describe this isolated browser-test environment; none is needed by or bundled into the website.

The final design probe ran from repository root with exit code 0:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/loom-browsers \
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

Its JSON and selected screenshots were copied to the permitted evidence directory. All 16 final checks passed. The first phone screen has 37 words of prose; five sizes are rendered at each inspected home width, two font families and three weights. The probe found no clipping, text overlap, horizontal overflow, missing local resources or script errors. Two controls are narrower than the 44px comfort target but pass the 24px/spacing criterion; their height remains 44px.

Evidence files:

- `frontend-evidence/browser-results.json`: named groups, versions, timestamps and durations.
- `frontend-evidence/chromium-accessibility.json` and `webkit-accessibility.json`: actual axe results, including no incomplete rules on the audited state.
- `frontend-evidence/taste.json`: final probe results and measured text/color/layout data.
- `frontend-evidence/live-home-390.png`, `live-home-1440.png`: real read-only home state from the final probe.
- `frontend-evidence/home-focus-390.png`: manually inspected keyboard focus on the primary action.
- `frontend-evidence/chromium-collection-390.png`, `webkit-collection-390.png`: **mocked** collection states showing the mint control on the opening screen.
- The other `chromium-*` / `webkit-*` screenshots also use mocked chain/wallet data; they are test evidence, not claims of live collections or mints.
- `frontend-evidence/live-read.json`: actual read-only configured-RPC results.
- `frontend-evidence/submission-size.json`: final allowed-path and submission-bundle size check.

The provided browser tool was also used to navigate the actual export, view mobile/desktop screenshots, inspect resources and overflow, check keyboard focus and recheck enlarged text. Its final console inspection reported zero errors and zero warnings. Generated tool scratch output was moved into `test/scratch/`; none is part of the delivery.

## Interaction coverage

Both browser engines ran the same 16 groups, using real exported JavaScript and implementation-derived ABIs with mocked EIP-1193/RPC replies:

1. Static subpath loading, runtime manifest/ABI loading, disconnected action gate and creation defaults.
2. Two named EIP-6963 wallets, hidden generic duplicate, connect rejection, Escape close and focus return.
3. Unknown-chain error, exact `wallet_addEthereumChain` parameters, second switch and enabled correct-chain state.
4. Royalty limit validation, exact 0.002 ETH factory payment, creator/royalty arguments, receipt-event navigation to the clone.
5. Mint on the first phone screen; quantity 2 at price 0.001 ETH sends **0.003 ETH**; lock through confirmation and refresh; owned IDs appear.
6. Lifetime-cap rejection, decoded contract simulation revert, wallet rejection and retry availability, with no unexpected sends.
7. External chain change disables minting; switching recovers it.
8. Owner base URI, provenance disabled after first mint, pause/resume, paid reserve mint and irreversible freeze confirmation/cancellation.
9. Transfer changes current ownership; the transferred token disappears from the wallet shelf.
10. Native buy: quoter result, slippage minimum, exact pool/hook/router/action encoding, ETH value and no approvals.
11. Sell: separate ERC-20-to-Permit2 and Permit2-to-router approvals, exact amounts, refreshed allowances, zero ETH on router execution.
12. Slippage bounds, insufficient funds before signing, quote expiry tested with the browser’s accelerated clock rather than real-time waiting.
13. 320/390/768/1440 widths, long values/full addresses, 200% root text enlargement, accessibility scan and zero script errors.
14. Four mobile wallet links, wallet marks, Coinbase Smart Wallet row and sheet overflow.
15. RPC failure and retry, wallet still available during reads, missing code disables writes, zero-active-liquidity disables quotes.
16. A modified factory ABI fails its hash check before any wallet/contract action is offered.

The four unit tests independently decode router input parameters (including the extended tuple), validate integer parsing and unsafe URI/address handling, and verify the complete final manifest/asset inventory.

## Live read observations

Read-only source: [configured Sepolia PublicNode endpoint](https://ethereum-sepolia-rpc.publicnode.com), block **11914198**, recorded at `2026-10-14T15:37:56.366Z` in `live-read.json`.

All three attested contract addresses returned nonempty code. The factory’s `implementation()` equals the attested `LoomCollection`; creation is unpaused; `collectionCount()` is zero. `CREATE_FEE` is `2000000000000000` wei. `PLATFORM_FEE` is `500000000000000` wei, with creator/platform/reserve shares `200000000000000`, `200000000000000`, `100000000000000` wei. The token reports Loom / LOOM / 18 decimals. The pool state view returned initialized slot0 and **0 active liquidity**, with fee 12500. These are observations at one block, not permanently asserted site data.

No private RPC endpoint appears in the delivered configuration. The local test server is only a preview mechanism, not a source citation or published URL.

## Better Interface: six-domain review

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked | Native controls, wrapping labels, associated hints, modal keyboard close/focus return, action names, visible focus, live regions, disabled prerequisites; axe passed in both engines. No real screen-reader session. |
| Layout | Checked | First-screen product/action, 320/390/768/1440, long names/amounts, open full addresses, wallet sheet, text enlargement. No native 200% browser zoom or physical-device test; RTL/localized layouts are not implemented. |
| Writing | Checked | Plain action labels, exact fee wording, lifetime allowance, irreversible-setting copy, unset metadata, unavailable liquidity, no invented USD or sample data. |
| Typography | Checked | Six-token scale; five observed home sizes, two families, three weights; input size, heading order, tabular amounts and wrapping. Local font glyphs can differ across operating systems. |
| Colors | Checked | Semantic token roles; rendered home pairs at 5.50:1 minimum and collection axe contrast check. No dark theme is implemented or claimed. |
| UI details | Checked | Hover/focus/press/disabled states, loading/empty/error/pending/success/retry, receipt refresh lock, modal confirmation, flat surfaces and reduced-motion probe. Animation-panel slow playback is not applicable to the absent staged/infinite animations; short color transitions were source-reviewed. |

## Findings repaired

All locations refer to final source; the descriptions distinguish the prior behavior from the fix.

| Severity / domain | Location | Finding, correction and recheck |
| --- | --- | --- |
| Medium / accessibility | `web/src/ui.tsx:16` | Field hints were visible but not associated with inputs. `Field` now supplies stable `aria-describedby` and error IDs/invalid state. Rechecked by source review and both browser accessibility scans. |
| High / transaction UI | `web/src/transactions.tsx:44` | Buttons could re-enable between receipt success and query refresh while the internal write lock remained active. Added an explicit `refreshing` phase and retained the lock. Owner and approval sequences now pass in both engines. |
| Medium / layout & UI | `web/src/OwnerPanel.tsx:19` | Saving a base URI changed a derived `open` prop and collapsed the active owner studio. Open state now follows the user’s disclosure choice; saving metadata, pausing and reserve minting stay reachable. Both engines passed the sequence. |
| High / layout | `web/src/styles.css:56` | At 390px and 200% root text size, navigation caused document width 409px. Enabled wrapping on header navigation and wrapping of fact labels. Final width is 390px; manually re-viewed and covered by both final browser runs. |
| Medium / wallet UI | `web/src/open-in.ts:5` | The pinned reference omitted a complete Rabby link expression. Verified its upstream handler and used the supported `_cmd=open-dapp&dapp=…` query. The mobile sheet tests pass; actual native app launching remains untested. |
| Medium / transaction UI | `web/src/transactions.tsx:49` | A network error after obtaining a hash could otherwise invite resubmission. Unknown confirmation now retains a write lock and offers receipt recheck. Source-reviewed; the full 120-second live timeout/replacement paths were not broadcast-tested. |
| Low / accessibility | `web/src/Tokens.tsx:14` | Multiple token sections could reuse a heading ID. Each section now uses a React-generated ID. Source-reviewed; the audited single-collection state has no violations. |

No unresolved high or medium issue was observed in the completed checks. The write-scope conflict is a documented delivery-path exception, not a claim that a forbidden root file exists.

## Remaining limitations and publication boundary

- No real funds were spent. Live creation, minting, reserve minting, transfer, owner settings, token approval and swap execution were not broadcast-tested. Mocks validate frontend behavior and encoded requests; they do not independently verify EVM economics.
- The actual pool needs active liquidity before the trade controls can become available. The worker did not change pool liquidity or deployments.
- Coinbase passkey enrollment, physical mobile wallets, extension-specific prompts, native app deep-link handoffs, real-wallet reload reconnect, replacement/reorg behavior and a live timeout recovery were not exercised against real accounts. Connector integration and standard mocked provider behavior are covered.
- Token scanning is bounded/paged and can require many user-requested pages on large collections. It reports its range and snapshot; a backend/global index is not present. Token images are not fetched/rendered; IDs and metadata links are displayed.
- No manual screen-reader session, native browser zoom, physical touchscreen, locale/RTL adaptation or forced-colors screenshot was performed. The checks above are not a blanket accessibility compliance claim.
- Metadata availability depends on the owner’s external hosting/pinning. The UI cannot prove an off-chain provenance algorithm, reveal fairness or permanent IPFS availability.
- Relative Open Graph image paths are intentional for a gateway-subpath export with no assigned public domain. The publisher can validate link unfurling once a URL exists.
- Publication, named-site resolution, immutable CID validation, asset HTTP checks and the control plane’s final RPC checks occur after this worker’s source/export submission. Their future success is not asserted here.
