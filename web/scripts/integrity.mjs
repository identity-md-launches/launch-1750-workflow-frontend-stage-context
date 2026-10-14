import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { keccak256, stringToHex } from 'viem';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const dist = resolve(root, 'dist');
export const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const abiHash = abi => keccak256(stringToHex(canonical(abi))).slice(2);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function inventory(directory = dist) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${entry.name}`);
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await inventory(path));
    else if (path !== resolve(dist, 'imd-deployment.json')) paths.push(path);
  }
  return paths.sort();
}
export async function validate() {
  const handoff = await readJson(resolve(root, 'web/deployment-handoff.json'));
  const network = await readJson(resolve(root, 'web/network-handoff.json'));
  const manifest = await readJson(resolve(dist, 'imd-deployment.json'));
  const expected = ['version','launchId','chainId','sourceCommit','attestationHash','contracts','assets','network','walletAddChain', ...(handoff.poolKey ? ['poolKey'] : [])].sort();
  if (canonical(Object.keys(manifest).sort()) !== canonical(expected)) throw new Error('Manifest contains missing or extra top-level keys.');
  for (const key of ['version','launchId','chainId','sourceCommit','attestationHash','poolKey']) if (canonical(manifest[key]) !== canonical(handoff[key])) throw new Error(`Handoff mismatch: ${key}`);
  for (const key of ['network','walletAddChain']) if (canonical(manifest[key]) !== canonical(network[key])) throw new Error(`Network mismatch: ${key}`);
  if (manifest.contracts.length !== handoff.contracts.length) throw new Error('Wrong contract set.');
  const safe = path => typeof path === 'string' && path && !path.startsWith('/') && !/[\\:?#%]/.test(path) && path.split('/').every(p => p && p !== '.' && p !== '..');
  for (const [index, c] of manifest.contracts.entries()) {
    const expectedContract = handoff.contracts[index];
    if (Object.keys(c).sort().join() !== 'abiHash,abiPath,address,name') throw new Error('Invalid contract keys.');
    for (const key of ['name','address','abiHash']) if (c[key] !== expectedContract[key]) throw new Error(`Contract mismatch: ${c.name}.${key}`);
    if (!safe(c.abiPath)) throw new Error('Unsafe ABI path.');
    const abi = await readJson(resolve(dist, c.abiPath));
    if (!Array.isArray(abi) || abiHash(abi) !== c.abiHash) throw new Error(`ABI hash mismatch: ${c.name}`);
  }
  const files = await inventory();
  if (files.length > 128 || manifest.assets.length !== files.length) throw new Error('Asset count mismatch or budget exceeded.');
  const paths = new Set(); let totalBytes = 0;
  for (const asset of manifest.assets) {
    if (!safe(asset.path) || asset.path === 'imd-deployment.json' || paths.has(asset.path)) throw new Error(`Unsafe/duplicate asset: ${asset.path}`);
    paths.add(asset.path);
    const bytes = await readFile(resolve(dist, asset.path));
    if (bytes.length > 8388608) throw new Error('Asset exceeds 8 MiB.');
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || sha256(bytes) !== asset.sha256) throw new Error(`Asset hash mismatch: ${asset.path}`);
    totalBytes += bytes.length;
  }
  for (const file of files) if (!paths.has(relative(dist, file).split(sep).join('/'))) throw new Error(`Undeclared file: ${file}`);
  if (totalBytes >= 32 * 1024 * 1024) throw new Error('Export exceeds HTTP response budget.');
  return { assets: files.length, totalBytes, manifestBytes: (await stat(resolve(dist, 'imd-deployment.json'))).size, contracts: manifest.contracts.map(c => ({ name: c.name, abiHash: c.abiHash })) };
}
