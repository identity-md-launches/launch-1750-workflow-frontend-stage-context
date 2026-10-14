# Frontend attribution

The interface and review applied the assignment’s pinned Better Interface guidance: Jakub Krehel, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, MIT. [Upstream source](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface).

Design documentation follows the adapted Impeccable documentation method by Paul Bakaus, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, Apache-2.0. [Original document method](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md). Both design-guide license texts are retained in `DESIGN-GUIDE-LICENSES.txt`; these works retain their separate licenses.

The Ethereum UX checklist was the supplied adaptation of Austin Griffith’s ethskills frontend-ux guide, commit `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`, MIT. Its notice/license is retained in `ETH-FRONTEND-UX-LICENSE.txt`. No live ethskills pages were fetched.

The MetaMask, Rabby and Phantom wallet marks were extracted from `@rainbow-me/rainbowkit` 2.2.11. The Coinbase mark comes from the pinned connector reference. RainbowKit’s MIT license is retained in `web/WALLET-ICONS-LICENSE.txt`; wallet trademarks belong to their respective owners. Loom’s brand mark, woven SVG and share-card layout were drawn in the frontend source for this assignment.

The Rabby mobile link uses `_cmd=open-dapp&dapp=…`, as handled in [Rabby’s universal-link source](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts), with the production host/path from its [link constants](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts). The source was read on 2026-10-14 to resolve the pinned reference’s omitted Rabby URL expression. Physical-app deep-link behavior remains untested; the browser tests check the rendered links and encoding.

Runtime libraries are ordinary pinned npm dependencies with their package licenses. No dependency registry or package archive is included in this submission.
