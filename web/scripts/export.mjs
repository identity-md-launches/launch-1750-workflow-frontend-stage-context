import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, relative, sep } from 'node:path';
import { root, dist, abiHash, sha256, readJson, inventory, validate } from './integrity.mjs';

const handoff = await readJson(resolve(root, 'web/deployment-handoff.json'));
const network = await readJson(resolve(root, 'web/network-handoff.json'));
await mkdir(resolve(dist, 'abi'), { recursive: true });
const contracts = [];
for (const { name, address, abiHash: expected } of handoff.contracts) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || !/^[a-f0-9]{40}$/.test(handoff.sourceCommit)) throw new Error('Invalid pinned source reference.');
  const source = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${name}.json`], { cwd: root, encoding: 'utf8' });
  const abi = JSON.parse(source);
  if (!Array.isArray(abi) || abiHash(abi) !== expected) throw new Error(`Pinned ABI does not match handoff: ${name}`);
  const abiPath = `abi/${name}.json`;
  await writeFile(resolve(dist, abiPath), source);
  contracts.push({ name, address, abiHash: expected, abiPath });
}
const assets = await Promise.all((await inventory()).map(async file => ({ path: relative(dist, file).split(sep).join('/'), sha256: sha256(await readFile(file)) })));
const { version, launchId, chainId, sourceCommit, attestationHash, poolKey } = handoff;
const manifest = { version, launchId, chainId, sourceCommit, attestationHash, contracts, assets, ...(poolKey ? { poolKey } : {}), ...network };
await writeFile(resolve(dist, 'imd-deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Static deployment verified:', await validate());
