import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { decodeAbiParameters, parseEther } from 'viem';
import { serve } from '../scripts/serve.mjs';
import { root } from '../scripts/integrity.mjs';
import { makeMock, attachMock, account, clone, other, manifest } from './mock-chain.mjs';
import { poolComponents } from '../src/swap-protocol.ts';

const evidence = resolve(root, 'docs/frontend-evidence');
await mkdir(evidence, { recursive: true });
const server = await serve(0); const url = `http://127.0.0.1:${server.address().port}/preview/`;
const report = { startedAt:new Date().toISOString(), testMode:'Mocked wallet and RPC; no signing keys or real broadcasts', browsers:[], checks:[] };
const openBrowsers = []; let activePage; let activeMock;
const until = async (fn, message, timeout=12000) => { const start=Date.now(); while (Date.now()-start<timeout) { if (await fn()) return; await new Promise(r=>setTimeout(r,75)); } throw new Error(message); };
const check = async (name, fn) => { const start=Date.now(); await fn(); report.checks.push({ name, passed:true, durationMs:Date.now()-start }); console.log(`PASS ${name}`); };
const screenshot = async (page, name) => page.screenshot({path:resolve(evidence,name),fullPage:false});

try {
  for (const [browserName, engine] of [['chromium',chromium],['webkit',webkit]]) {
    let browser;
    try { browser = await engine.launch({ headless:true, ...(browserName==='chromium' && process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}) }); }
    catch(e) { report.browsers.push({browser:browserName,available:false,error:e.message}); if (browserName==='chromium') throw e; console.log(`UNAVAILABLE ${browserName}: ${e.message.split('\n')[0]}`); continue; }
    report.browsers.push({browser:browserName,available:true,version:browser.version()});
    openBrowsers.push(browser);
    const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const mock = makeMock(); await attachMock(context,mock); const page=await context.newPage();
    activePage=page; activeMock=mock;
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const prefix = name => `${browserName}: ${name}`;
    await check(prefix('static subpath, real manifest, disconnected state, mobile first action'),async()=>{
      await page.goto(url); await page.getByRole('heading',{name:'Art starts with a collection.'}).waitFor();
      await until(()=>page.getByText('0.002 ETH to create',{exact:false}).count(),'Creation fee did not render');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
      const box=await page.locator('.hero-copy .primary').boundingBox(); assert.ok(box.y+box.height<844);
      await screenshot(page,`${browserName}-home-390.png`);
      await page.getByRole('link',{name:'Create',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Create collection',exact:true}).isDisabled(),true);
      assert.equal(await page.getByLabel('Mint price (ETH)',{exact:true}).inputValue(),'0');
      assert.equal(await page.getByLabel('Royalty (%)',{exact:true}).inputValue(),'5');
    });
    await check(prefix('EIP-6963 discovery, rejection, keyboard close and focus restoration'),async()=>{
      await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Browser wallet',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Test wallet',exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'Second wallet',exact:true}).count(),1);
      mock.state.rejectConnect=true;
      await page.getByRole('button',{name:'Test wallet',exact:true}).click();
      await page.getByText('Request declined in your wallet.',{exact:false}).waitFor();
      await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(),0);
      assert.equal(await page.evaluate(()=>document.activeElement.textContent.includes('Connect wallet')),true);
      mock.state.rejectConnect=false;
    });
    await check(prefix('unknown chain add then switch, exact network parameters'),async()=>{
      await page.getByRole('button',{name:'Connect wallet',exact:true}).click(); await page.getByRole('button',{name:'Test wallet',exact:true}).click();
      await until(()=>mock.state.walletChain===manifest.chainId,'Wallet did not switch');
      const add=mock.state.requests.find(r=>r.method==='wallet_addEthereumChain'); assert.deepEqual(add.params,[manifest.walletAddChain]);
      assert.equal(mock.state.requests.filter(r=>r.method==='wallet_switchEthereumChain').length,2);
      await until(async()=>!(await page.getByRole('button',{name:'Create collection',exact:true}).isDisabled()),'Create did not enable');
    });
    await check(prefix('create validation, exact factory payment and event navigation'),async()=>{
      await page.getByLabel('Collection name',{exact:true}).fill('Field notes'); await page.getByLabel('Symbol',{exact:true}).fill('FIELD');
      await page.getByLabel('Royalty (%)',{exact:true}).fill('10.01');
      await page.getByRole('button',{name:'Create collection',exact:true}).click(); await page.getByText('Choose a royalty from 0% to 10%',{exact:false}).waitFor(); assert.equal(mock.state.sent.length,0);
      await page.getByLabel('Royalty (%)',{exact:true}).fill('5'); await page.getByLabel('Mint price (ETH)',{exact:true}).fill('0.001');
      await page.getByRole('button',{name:'Create collection',exact:true}).click();
      await page.getByRole('heading',{name:'Mint this collection',exact:true}).waitFor();
      const sent=mock.state.sent[0]; assert.equal(sent.decoded.functionName,'createCollection'); assert.equal(BigInt(sent.value),parseEther('0.002'));
      assert.equal(sent.decoded.args[3],parseEther('0.001')); assert.equal(sent.decoded.args[6],500n); assert.equal(sent.decoded.args[5].toLowerCase(),account);
      assert.ok(page.url().toLowerCase().includes(clone));
    });
    await check(prefix('mint first screen, exact quantity fee, pending lock, confirmation and tokens'),async()=>{
      const mint=page.getByRole('button',{name:'Mint tokens',exact:true}); await until(async()=>!(await mint.isDisabled()),'Mint did not enable');
      const box=await mint.boundingBox(); assert.ok(box.y+box.height<844,`Mint bottom ${box.y+box.height} is outside first screen`);
      await screenshot(page,`${browserName}-collection-390.png`);
      await page.getByLabel('Quantity',{exact:true}).fill('2'); mock.state.holdReceipt=true; await mint.click();
      await until(()=>mock.state.sent.length===2,'Mint did not submit');
      assert.equal(BigInt(mock.state.sent[1].value),parseEther('0.003')); assert.equal(mock.state.sent[1].decoded.args[0],2n);
      assert.equal(await page.getByRole('button',{name:'Minting…',exact:true}).isDisabled(),true);
      mock.state.holdReceipt=false;
      await page.getByText('Token #1',{exact:true}).waitFor({timeout:15000}); await page.getByText('Token #2',{exact:true}).waitFor();
      assert.equal(mock.state.totalSupply,2n);
    });
    await check(prefix('wallet cap, simulation revert, user rejection and recovery'),async()=>{
      await page.getByLabel('Quantity',{exact:true}).fill('2'); await page.getByRole('button',{name:'Mint tokens',exact:true}).click();
      await page.getByText('Choose a quantity within your remaining lifetime mint allowance.',{exact:true}).waitFor(); assert.equal(mock.state.sent.length,2);
      await page.getByLabel('Quantity',{exact:true}).fill('1'); mock.state.revertSimulation='SupplyCapExceeded'; await page.getByRole('button',{name:'Mint tokens',exact:true}).click();
      await page.getByText('This quantity exceeds the remaining collection supply.',{exact:false}).first().waitFor(); assert.equal(mock.state.sent.length,2);
      mock.state.revertSimulation=''; mock.state.rejectSend=true; await page.getByRole('button',{name:'Mint tokens',exact:true}).click();
      await page.getByText('Request declined in your wallet.',{exact:false}).first().waitFor(); assert.equal(mock.state.sent.length,2);
      mock.state.rejectSend=false;
      assert.equal(await page.getByRole('button',{name:'Mint tokens',exact:true}).isDisabled(),false);
    });
    await check(prefix('wrong-chain action gate and switch recovery'),async()=>{
      mock.state.walletChain=1; await page.evaluate(()=>window.__testProvider.emit('chainChanged','0x1'));
      await page.getByRole('button',{name:'Switch to Sepolia',exact:true}).waitFor(); assert.equal(await page.getByRole('button',{name:'Mint tokens',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Switch to Sepolia',exact:true}).click(); await until(async()=>!(await page.getByRole('button',{name:'Mint tokens',exact:true}).isDisabled()),'Mint stayed disabled after switching');
    });
    await check(prefix('owner metadata, pause/resume, reserve fee and irreversible confirmation'),async()=>{
      assert.equal(await page.getByRole('button',{name:'Record provenance',exact:true}).isDisabled(),true);
      await page.getByLabel('Base metadata URI',{exact:true}).fill('https://example.com/metadata/'); await page.getByRole('button',{name:'Save base URI',exact:true}).click();
      await until(()=>mock.state.baseURI==='https://example.com/metadata/','Base URI not saved');
      await until(async()=>!(await page.getByRole('button',{name:'Pause minting',exact:true}).isDisabled()),'Pause busy'); await page.getByRole('button',{name:'Pause minting',exact:true}).click();
      await page.getByRole('button',{name:'Resume minting',exact:true}).waitFor(); assert.equal(await page.getByRole('button',{name:'Mint tokens',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Resume minting',exact:true}).click(); await page.getByRole('button',{name:'Pause minting',exact:true}).waitFor();
      const previous=mock.state.sent.length; await page.getByRole('button',{name:'Mint owner reserve',exact:true}).click();
      await until(()=>mock.state.reserveMinted===1n,'Reserve mint not confirmed'); assert.equal(BigInt(mock.state.sent[previous].value),parseEther('0.0015'));
      await until(async()=>!(await page.getByRole('button',{name:'Freeze metadata forever',exact:true}).isDisabled()),'Freeze busy'); await page.getByRole('button',{name:'Freeze metadata forever',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Freeze metadata forever',exact:true}); await dialog.waitFor(); assert.equal(mock.state.frozen,false);
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click(); assert.equal(mock.state.frozen,false);
      await page.getByRole('button',{name:'Freeze metadata forever',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Freeze metadata forever',exact:true}).click();
      await until(()=>mock.state.frozen,'Metadata not frozen'); await until(async()=>await page.getByRole('button',{name:'Save base URI',exact:true}).isDisabled(),'Metadata setter still enabled');
    });
    await check(prefix('current ownership after transfer and wallet token shelf'),async()=>{
      await page.getByText('Transfer a token',{exact:true}).click(); await page.getByLabel('Token ID',{exact:true}).fill('1'); await page.getByLabel('Recipient address',{exact:true}).fill(other);
      await page.getByRole('button',{name:'Transfer token',exact:true}).click(); await until(()=>mock.state.owners.get(1n)?.toLowerCase()===other,'Token not transferred');
      await until(async()=>await page.getByText('Token #1',{exact:true}).count()===0,'Transferred token remains visible');
      await page.getByRole('link',{name:'Your tokens',exact:true}).click(); await page.getByText('Token #2',{exact:true}).waitFor(); assert.equal(await page.getByText('Token #1',{exact:true}).count(),0);
    });
    await check(prefix('buy quote, slippage minimum and native router encoding'),async()=>{
      await page.getByRole('link',{name:'Trade',exact:true}).click(); await page.getByLabel('You pay (ETH)',{exact:true}).fill('0.01');
      await until(async()=>!(await page.getByRole('button',{name:'Get quote',exact:true}).isDisabled()),'Quote unavailable');
      await page.getByRole('button',{name:'Get quote',exact:true}).click(); await page.getByRole('button',{name:'Swap for LOOM',exact:true}).waitFor();
      await page.getByRole('button',{name:'Swap for LOOM',exact:true}).click(); await until(()=>mock.state.sent.at(-1)?.decoded.functionName==='execute','Buy not submitted');
      const sent=mock.state.sent.at(-1); assert.equal(sent.to.toLowerCase(),protocolAddress('universalRouter')); assert.equal(BigInt(sent.value),parseEther('0.01')); assert.equal(sent.decoded.args[0],'0x10');
      const [actions,params]=decodeAbiParameters([{type:'bytes'},{type:'bytes[]'}],sent.decoded.args[1][0]); assert.equal(actions,'0x060c0f');
      const [swapParams]=decodeAbiParameters([{type:'tuple',components:[{name:'poolKey',type:'tuple',components:poolComponents},{name:'zeroForOne',type:'bool'},{name:'amountIn',type:'uint128'},{name:'amountOutMinimum',type:'uint128'},{name:'hookData',type:'bytes'}]}],params[0]);
      assert.equal(swapParams.poolKey.hooks.toLowerCase(),manifest.poolKey.hooks); assert.equal(swapParams.amountOutMinimum,parseEther('0.0199')); assert.equal(swapParams.zeroForOne,true);
      assert.equal(mock.state.sent.filter(t=>t.decoded.functionName==='approve').length,0);
      await until(()=>mock.state.pending.get(sent.hash)?.applied,'Buy unconfirmed');
    });
    await check(prefix('sell approvals separated, exact amount, allowance refresh and zero ETH value'),async()=>{
      await until(async()=>await page.getByRole('button',{name:'Get quote',exact:true}).isEnabled(),'Prior transaction busy');
      await page.getByRole('button',{name:'Sell LOOM',exact:true}).click(); await page.getByLabel('You pay (LOOM)',{exact:true}).fill('1');
      await page.getByRole('button',{name:'Get quote',exact:true}).click(); await page.getByRole('button',{name:'1. Approve LOOM to Permit2',exact:true}).click();
      await page.getByRole('button',{name:'2. Authorize the router',exact:true}).waitFor();
      const erc=mock.state.sent.at(-1); assert.equal(erc.decoded.args[0].toLowerCase(),protocolAddress('permit2')); assert.equal(erc.decoded.args[1],parseEther('1'));
      await page.getByRole('button',{name:'2. Authorize the router',exact:true}).click(); await page.getByRole('button',{name:'Swap for ETH',exact:true}).waitFor();
      const permit=mock.state.sent.at(-1); assert.equal(permit.to.toLowerCase(),protocolAddress('permit2')); assert.equal(permit.decoded.args[1].toLowerCase(),protocolAddress('universalRouter')); assert.equal(permit.decoded.args[2],parseEther('1'));
      await page.getByRole('button',{name:'Swap for ETH',exact:true}).click(); await until(()=>mock.state.sent.at(-1)?.decoded.functionName==='execute','Sell not submitted');
      assert.equal(BigInt(mock.state.sent.at(-1).value ?? 0),0n);
      await until(()=>mock.state.pending.get(mock.state.sent.at(-1).hash)?.applied,'Sell unconfirmed');
    });
    await check(prefix('quote expiry, slippage validation and insufficient funds'),async()=>{
      await until(async()=>await page.getByRole('button',{name:'Get quote',exact:true}).isEnabled(),'Prior swap busy');
      await page.getByRole('button',{name:'Buy LOOM',exact:true}).click(); await page.getByLabel('You pay (ETH)',{exact:true}).fill('0.01');
      await page.getByLabel('Slippage tolerance (%)',{exact:true}).fill('5.01'); await page.getByRole('button',{name:'Get quote',exact:true}).click();
      await page.getByText('Choose slippage between 0% and 5%.',{exact:true}).waitFor();
      await page.getByLabel('Slippage tolerance (%)',{exact:true}).fill('0.5'); await page.getByRole('button',{name:'Get quote',exact:true}).click();
      await page.getByRole('button',{name:'Swap for LOOM',exact:true}).waitFor();
      const before=mock.state.sent.length; mock.state.nativeBalance=0n;
      await page.getByRole('button',{name:'Swap for LOOM',exact:true}).click();
      await page.getByText('Your wallet needs more Sepolia ETH',{exact:false}).first().waitFor(); assert.equal(mock.state.sent.length,before);
      mock.state.nativeBalance=parseEther('100');
      await page.clock.install(); await page.getByRole('button',{name:'Get quote',exact:true}).click(); await page.getByRole('button',{name:'Swap for LOOM',exact:true}).waitFor();
      await page.clock.fastForward(61000); await page.getByText('Expired; get a new quote',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Swap for LOOM',exact:true}).isDisabled(),true);
    });
    await check(prefix('responsive widths, long values, accessibility and script errors'),async()=>{
      await page.getByRole('link',{name:'Explore',exact:true}).click();
      for (const width of [320,390,768,1440]) { await page.setViewportSize({width,height:900}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width); }
      await screenshot(page,`${browserName}-collections-1440.png`);
      mock.state.name='A very long collection name without unexpected truncation'; mock.state.maxSupply=123456789012345678901234567890n;
      await page.goto(`${url}#/collection/${clone}`); await page.getByRole('heading',{name:mock.state.name,exact:true}).waitFor();
      for (const width of [320,390]) { await page.setViewportSize({width,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,`Long values overflow ${width}`); }
      await page.locator('.collection-details summary').click(); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
      await page.evaluate(()=>document.documentElement.style.fontSize='200%'); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390,'200% text resize overflow');
      await page.evaluate(()=>document.documentElement.style.fontSize='');
      const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      await writeFile(resolve(evidence,`${browserName}-accessibility.json`),JSON.stringify({violations:audit.violations,passes:audit.passes.map(p=>p.id),incomplete:audit.incomplete.map(p=>({id:p.id,description:p.description}))},null,2));
      assert.equal(audit.violations.length,0,JSON.stringify(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
      assert.deepEqual(errors,[]);
    });
    await context.close();
    const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
    const mobileMock=makeMock(); await attachMock(phone,mobileMock,{wallet:false}); const mobilePage=await phone.newPage();
    await check(prefix('mobile wallet deep links, marks and Coinbase Smart Wallet'),async()=>{
      await mobilePage.goto(url); await mobilePage.getByRole('button',{name:'Connect wallet',exact:true}).click();
      for (const name of ['MetaMask','Coinbase Wallet','Rabby','Phantom']) assert.equal(await mobilePage.getByRole('link',{name:`Open in ${name}`,exact:true}).count(),1);
      assert.equal(await mobilePage.getByRole('button',{name:'Coinbase Smart Wallet',exact:true}).count(),1);
      assert.equal(await mobilePage.getByRole('button',{name:'Browser wallet',exact:true}).count(),0);
      assert.equal(await mobilePage.evaluate(()=>document.documentElement.scrollWidth),390);
      await screenshot(mobilePage,`${browserName}-wallet-mobile.png`);
    });
    await phone.close();
    const failureContext=await browser.newContext({viewport:{width:390,height:844}}); const failed=makeMock(); failed.state.rpcDown=true; await attachMock(failureContext,failed,{wallet:false}); const failurePage=await failureContext.newPage();
    await check(prefix('RPC failure/retry, missing code guard and zero active liquidity'),async()=>{
      await failurePage.goto(url); await failurePage.getByRole('button',{name:'Retry network reads',exact:true}).waitFor();
      assert.equal(await failurePage.getByRole('button',{name:'Connect wallet',exact:true}).isEnabled(),true);
      failed.state.rpcDown=false; await failurePage.getByRole('button',{name:'Retry network reads',exact:true}).click();
      await failurePage.getByText('The first collection is still to come.',{exact:true}).waitFor();
      failed.state.missingCode=true; await failurePage.reload(); await failurePage.getByText('Contract verification failed.',{exact:false}).waitFor();
      await failurePage.getByRole('link',{name:'Create',exact:true}).click(); assert.equal(await failurePage.getByRole('button',{name:'Create collection',exact:true}).isDisabled(),true);
      failed.state.missingCode=false; failed.state.liquidity=0n; await failurePage.goto(`${url}#/trade`); await failurePage.reload();
      await failurePage.getByText('This pool has no active liquidity.',{exact:false}).waitFor(); assert.equal(await failurePage.getByRole('button',{name:'Get quote',exact:true}).isDisabled(),true);
    });
    await failureContext.close();
    const badContext=await browser.newContext(); await badContext.route('**/abi/LoomFactory.json',async route=>route.fulfill({contentType:'application/json',body:'[]'})); const badPage=await badContext.newPage();
    await check(prefix('ABI tamper fails closed before wallet or contract actions'),async()=>{
      await badPage.goto(url); await badPage.getByRole('heading',{name:'Loom could not load.',exact:true}).waitFor(); await badPage.getByText('The LoomFactory ABI does not match its attestation.',{exact:false}).waitFor(); assert.equal(await badPage.getByRole('button',{name:'Connect wallet',exact:true}).count(),0);
    });
    await badContext.close(); await browser.close();
  }
} catch(e) { report.failure={message:e.message,stack:e.stack,text:await activePage?.locator('body').innerText().catch(()=>''),requests:activeMock?.state.requests.slice(-15)}; await activePage?.screenshot({path:resolve(root,'test/scratch/browser-failure.png')}).catch(()=>{}); console.error(e); process.exitCode=1; }
finally { report.finishedAt=new Date().toISOString(); await writeFile(resolve(evidence,'browser-results.json'),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n'); await Promise.all(openBrowsers.map(b=>b.close())); server.close(); }
function protocolAddress(name) { return manifest.network.uniswapV4[name].toLowerCase(); }
