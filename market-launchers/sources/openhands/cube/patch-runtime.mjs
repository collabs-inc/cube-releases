import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
const scripts = path.join(process.argv[2], 'node_modules/@openhands/agent-canvas/scripts');
// Stable 1.24.0 predates upstream's loopback bind-policy work. Fail closed on
// source drift instead of silently exposing the session-key-injecting frontend.
for (const [name, before, after] of [
  ['ingress.mjs', 'server.listen(config.port, () => {', 'server.listen(config.port, "127.0.0.1", () => {'],
  ['static-server.mjs', 'host: "::",', 'host: "127.0.0.1",'],
  ['dev-with-automation.mjs', 'shutdownHooks.run();\n    process.exit(0);\n  }, 3000);', 'shutdownHooks.run();\n    process.exit(0);\n  }, 1000);'],
]) {
  const file = path.join(scripts, name);
  const source = await readFile(file, 'utf8');
  if (source.includes(after)) continue;
  if (source.split(before).length !== 2) throw new Error(`Unexpected upstream binding in ${name}`);
  await writeFile(file, source.replace(before, after));
}
