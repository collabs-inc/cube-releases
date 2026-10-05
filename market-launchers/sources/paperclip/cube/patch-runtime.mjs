import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
const file = path.join(process.argv[2], 'node_modules/@paperclipai/server/dist/middleware/private-hostname-guard.js');
const before = 'if (isLoopbackHostname(hostname) || allowSet.has(hostname)) {';
const after = 'if (isLoopbackHostname(hostname) || allowSet.has(hostname) || /^[a-z0-9][a-z0-9-]*-[a-z0-9]{8}(?:-stg)?\\.cube\\.site$/.test(hostname)) {';
const source = await readFile(file, 'utf8');
if (!source.includes(after)) {
  if (source.split(before).length !== 2) throw new Error('Unexpected Paperclip hostname guard; review this runtime version.');
  await writeFile(file, source.replace(before, after));
}
