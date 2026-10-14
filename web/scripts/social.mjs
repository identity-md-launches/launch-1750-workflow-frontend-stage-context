import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { root } from './integrity.mjs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const strokes = Array.from({ length: 10 }, (_, i) => `<path d="M${95 + i * 14} 345V${135 + i * 1.2}a${135 - i * 12} ${135 - i * 12} 0 0 1 ${270 - i * 24} 0v${170 - i * 5}"/>`).join('');
  const second = Array.from({ length: 10 }, (_, i) => `<path d="M${455 - i * 13} 50v${162 - i * 4}a${110 - i * 10} ${110 - i * 10} 0 0 1 ${-220 + i * 20} 0V${95 + i * 5}"/>`).join('');
  await page.setContent(`<html><body style="margin:0;background:#f6f4ed;color:#242b23;font-family:Arial,sans-serif"><div style="padding:56px;display:flex;justify-content:space-between"><div><div style="font-size:34px;font-weight:700;color:#203f32;margin-bottom:60px">loom</div><h1 style="font-size:70px;line-height:1.05;letter-spacing:-3px;margin:0">Art starts with<br><i style="font-family:Georgia,serif">a collection.</i></h1><p style="font-size:24px;margin-top:30px">Create. Mint. Collect.</p><p style="font-size:18px;margin-top:54px">NFT collections on Sepolia</p></div><svg width="510" height="400" style="margin-top:74px" viewBox="0 0 560 400"><rect width="560" height="400" fill="#ebe8da"/><g fill="none" stroke="#203f32" stroke-width="10">${strokes}</g><g fill="none" stroke="#b86d44" stroke-width="8">${second}</g></svg></div></body></html>`);
  await page.screenshot({ path: resolve(root, 'web/public/social.png') });
} finally { await browser.close(); }
