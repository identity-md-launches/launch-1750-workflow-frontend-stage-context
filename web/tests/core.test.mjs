import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, parseEther } from 'viem';
import { amount, uint, recipient, externalUri } from '../src/utils.ts';
import { swapInput, poolComponents } from '../src/swap-protocol.ts';
import { validate, readJson, dist } from '../scripts/integrity.mjs';
import { resolve } from 'node:path';

test('final manifest exactly matches handoff, ABI hashes and every exported asset',async()=>{ const result=await validate(); assert.ok(result.assets<128); assert.ok(result.totalBytes<8*1024*1024); });
test('amount parser never rounds and quantities require positive whole uint256 values',()=>{
  assert.equal(amount('0.000000000000000001'),1n); assert.equal(amount('5',2,true),500n); assert.equal(amount('0',18,true),0n);
  for(const value of ['1e3','-1','0.0000000000000000001','NaN','1,5','']) assert.throws(()=>amount(value));
  for(const value of ['0','1.1','-1','1e3']) assert.throws(()=>uint(value));
  assert.equal(uint('90071992547409930000'),90071992547409930000n);
});
test('addresses and metadata links reject unsafe or missing destinations',()=>{
  assert.throws(()=>recipient('')); assert.throws(()=>recipient('0x'+'0'.repeat(40)));
  assert.equal(externalUri('javascript:alert(1)'),undefined); assert.equal(externalUri('data:text/html,test'),undefined);
  assert.equal(externalUri('https://example.com/token.json'),'https://example.com/token.json');
});
test('router encoding preserves attested pool key, both directions and extended tuple',async()=>{
  const m=await readJson(resolve(dist,'imd-deployment.json')); const p=m.poolKey;
  for(const extended of [false,true]) for(const input of [p.currency0,p.currency1]) {
    const encoded=swapInput(p,input,parseEther('1'),parseEther('0.99'),extended);
    const [actions,params]=decodeAbiParameters([{type:'bytes'},{type:'bytes[]'}],encoded); assert.equal(actions,'0x060c0f');
    const components=[{type:'tuple',name:'poolKey',components:poolComponents},{type:'bool',name:'zeroForOne'},{type:'uint128',name:'amountIn'},{type:'uint128',name:'amountOutMinimum'},...(extended?[{type:'uint256',name:'minHopPriceX36'}]:[]),{type:'bytes',name:'hookData'}];
    const [decoded]=decodeAbiParameters([{type:'tuple',components}],params[0]);
    assert.equal(decoded.poolKey.hooks.toLowerCase(),p.hooks); assert.equal(decoded.poolKey.fee,p.fee); assert.equal(decoded.poolKey.tickSpacing,p.tickSpacing);
    assert.equal(decoded.zeroForOne,input===p.currency0); assert.equal(decoded.amountIn,parseEther('1')); assert.equal(decoded.amountOutMinimum,parseEther('0.99'));
    if(extended) assert.equal(decoded.minHopPriceX36,0n);
    assert.deepEqual(decodeAbiParameters([{type:'address'},{type:'uint256'}],params[1]).map(v=>typeof v==='string'?v.toLowerCase():v),[input,parseEther('1')]);
  }
});
