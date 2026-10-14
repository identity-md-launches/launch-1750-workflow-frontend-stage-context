# Loom: implemented interface

This document lives under `docs/` to comply with the assignment’s explicit write budget. Root `DESIGN.md` was requested by a lower-priority criterion, but root-file writes are prohibited.

## Overview

Loom serves creators launching NFT editions and collectors minting them on Sepolia. Its visual idea is a woven thread: an interlocking line mark and a restrained, code-drawn weave beside the desktop introduction. Warm paper backgrounds, dark green actions, generous spacing and direct controls support the collection workflow. The weave is decorative, not an example NFT or evidence of available artwork.

Creation and minting take priority over explanation. The home screen presents the wallet control, product, creation action and actual creation fee. Collection pages lead with the edition state, exact mint payment and mint control. Advanced owner settings use native disclosures. Empty/error states report actual reads rather than sample collections.

The source of truth is `web/src/styles.css`, `web/src/type.css`, shared primitives in `web/src/ui.tsx`, and the corresponding page components. All dimensions and behaviors below describe this implementation.

## Colors

The canonical CSS uses a small hex palette with separate primitive and semantic tokens.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--color-page` | `#f6f4ed` | Page paper |
| `--color-surface` | `#fcfbf7` | Inputs, mint/trade surfaces and dialogs |
| `--color-subtle` | `#ebe8dd` | Creation summary, metadata state, neutral notices |
| `--color-border` | `#d6d4c8` | Structural separators and secondary controls |
| `--color-text` | `#242b23` | Main text |
| `--color-muted` | `#60645b` | Supporting text and labels |
| `--color-accent`, `--color-focus` | `#203f32` | Primary action, brand, focus ring |
| `--color-hover` | `#2d513f` | Primary action hover |
| `--color-pressed` | `#192e24` | Primary action press |
| `--color-on-accent` | `#fcfbf7` | Primary button text |
| `--color-error` | `#9c3529` | Failure text |
| `--color-error-bg` | `#fceee7` | Failure notices |

The weave uses terracotta `#b86d44`, olive `#b8c185` and its own neutral grid inside SVG artwork; those are not additional action/status colors. Inputs use a stronger `#989e90` boundary. Only one filled green action carries primary emphasis within a task panel. Errors also have explanatory text and live-region semantics.

The rendered home probe measured main text at **13.21:1**, muted text at **5.50:1** against page paper, brand at **10.49:1**, and primary button text at **11.15:1**. These are the measured pairs in `frontend-evidence/taste.json`, not an assertion about every possible browser/OS state. The implemented theme is intentionally light; no dark variant exists.

## Typography

`web/src/type.css` defines local-only aliases: `Loom Sans` requests Arial regular and Arial Bold, with Arial/sans-serif fallbacks; `Loom Serif` requests Georgia Bold Italic, with Georgia/serif fallbacks. No font files or remote font services are needed. The rendered glyph face depends on the platform’s installed fonts; no cross-platform font identity is claimed.

| Token | Size at 16px root | Use |
| --- | --- | --- |
| `--text-small` | 14px | Navigation, hints, data labels |
| `--text-body` | 16px | Body, inputs and primary controls |
| `--text-medium` | 20px | Card and panel headings |
| `--text-title` | 28px | Section headings, brand, mobile collection name |
| `--text-large` | 40px | Page headings and mobile home headline |
| `--text-display` | 64px | Wide home headline |

Weights are 400, 600 and 700. The page headline is heaviest at 700; other headings and control emphasis use 600. The home headline’s italic second line is the only serif treatment. Headline line-height is 1.1, section headings 1.2, smaller headings 1.3, body/hints 1.5. Large headings use `-.045em` tracking; section headings use `-.025em`; body copy is naturally spaced.

Headings balance their lines; prose is capped at 66ch and uses pretty wrapping. Dynamic amounts use tabular numbers. Critical addresses, amounts and long names wrap instead of being clipped. Only the header’s compact wallet identity is abbreviated; opening it reveals the full checksummed address, copy action and explorer link. Inputs stay at a minimum 16px under the normal type scale.

## Layout

`page` is capped at 1232px with 48px desktop padding; the header is capped at 1328px. Layout gaps primarily use 8, 12, 16, 20, 24, 28, 32, 40, 48 and 64px. Related fields use 20px gaps; sections receive 40–64px separation. There is no fixed overlay covering page controls.

- Above 68rem: a two-column home introduction, three-column collection list, two-column creation/mint/trade layouts, and two-column owner controls.
- At 68rem: outer padding reduces to 32px, the home heading becomes 40px, the collection list becomes two columns, and the separate network label yields space to the wallet.
- At 48rem: navigation moves to a second header row and can wrap, outer padding becomes 24px, the decorative home weave disappears, and creation/mint/trade layouts become single-column. The metadata notice becomes compact but remains visible before minting.
- At 36rem: padding becomes 20px, collection/owner/token/how-to grids become one column, most fields stack, and the wallet dialog becomes a bottom sheet. Name/symbol fields retain a 1.5:1 grid. Safe-area padding is included in the sheet.

Browsers tested 320, 390, 768 and 1440 CSS pixels, including long collection names, very large supply values and expanded full addresses. The 390 × 844 home and collection screenshots show their primary controls on the first screen. A separate 200% root-text-size check verifies reflow; it is not a native browser zoom test.

## Elevation & Depth

The interface is flat: spacing, tonal sections and 1px separators establish grouping. Cards and forms have structure borders without shadows. Only the modal is elevated, using `0 24px 80px #192e2433` and a `#192e2477` backdrop. The dialog’s native top layer makes the background inert and preserves keyboard modal behavior.

## Shapes

Inputs, buttons and notices use 6px corners; cards and principal panels use 8px. The desktop dialog uses 12px; the mobile sheet uses 16px upper corners and square lower corners. The woven mark is an SVG line drawing; the decorative weave has 2px corners. No essential text is masked by a clipping container.

## Components

| Component/pattern | Source | Usage and states |
| --- | --- | --- |
| `Field` | `web/src/ui.tsx` | Persistent wrapping label, optional hint/error with `aria-describedby`, native input semantics |
| `Notice` | `web/src/ui.tsx` | Neutral `status` or error `alert`; persistent and actionable |
| `Modal` | `web/src/ui.tsx` | Native dialog, Escape/backdrop/close, initial focus and return to trigger; mobile bottom sheet |
| `AddressView` | `web/src/ui.tsx` | Full checksummed address, wrapping, explorer and copy |
| `.button`, `.primary`, `.text-button` | `web/src/styles.css` | Neutral/primary/inline variants; hover, press, focus and native disabled states |
| `Wallet` | `web/src/Wallet.tsx` | Disconnected picker, per-row pending, rejection, connected identity/disconnect, wrong-chain switch |
| `CollectionCard` | `web/src/App.tsx` | Real collection name, supply, all-in mint price, pause/sold-out state and mint-page link |
| `TransactionStatus` | `web/src/transactions.tsx` | Preparing, signing, confirming, refreshing, unknown, success and error; explorer/recheck recovery |
| `Tokens` | `web/src/Tokens.tsx` | Fixed-block paged ownership scan, loading/error/empty/owned states, metadata links and token transfer |
| `OwnerAction` | `web/src/OwnerPanel.tsx` | Per-setting control, eligibility/role/freeze gates, separate transaction state and irreversible confirmation |

Primary buttons and inputs are at least 48px high; wallet rows are at least 52px; header/inline/icon controls target 44px. Keyboard focus uses a 2px green outline with a 4px offset and a forced-colors override. The header skip link targets the main landmark, and hash-route navigation focuses it. Interactive color changes take 150ms only when reduced motion is not requested. There are no entrance or infinite animations.

## Do’s and Don’ts

- Start a page with the existing `page`, `page-heading`, `Field`, `Notice` and button styles. Reuse the six-size type scale and semantic color tokens.
- Put the action and its fee/eligibility beside each other. Keep metadata-unset, paused, wrong-network and unavailable-liquidity states explicit.
- Use one primary green control per task. Secondary navigation and owner settings stay neutral; costly actions remain visibly actionable.
- Use wrapped full values or the address component. Do not hide precision, substitute a USD estimate, or label partial ownership scans complete.
- Keep decorative art separate from collection data. Never present generated/demo collections or counts as live state.
- Preserve the modal’s keyboard path, the mobile header wrapping, and the transaction lock through refreshed state.
- Add a new route through the hash router and existing primitives; validate its narrow rendering and real contract prerequisites before adding new visual treatments.

See `FRONTEND-VALIDATION.md` for coverage, repaired findings and limitations, and `FRONTEND-ATTRIBUTION.md` for the pinned design guidance and licenses.
