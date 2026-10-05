import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
const scripts = path.join(process.argv[2], 'node_modules/@openhands/agent-canvas/scripts');
const { buildAgentServerCommand } = await import(pathToFileURL(path.join(scripts, 'dev-safe.mjs')));
const { buildAutomationCommand } = await import(pathToFileURL(path.join(scripts, 'dev-with-automation.mjs')));
for (const build of [buildAgentServerCommand, buildAutomationCommand]) {
  const { command, args } = build({});
  const result = spawnSync(command, [...args, '--help'], { env: process.env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Could not prepare OpenHands Python runtime.');
}
// --help resolves packages but never imports the application. On a cold Linux
// volume, importing the two backends sequentially exceeds Cube's startup time.
const temporary = await mkdtemp(path.join(os.tmpdir(), 'cube-openhands-warm-'));
try {
  for (const [build, executable, module] of [
    [buildAgentServerCommand, 'agent-server', 'openhands.agent_server.api'],
    [buildAutomationCommand, 'uvicorn', 'openhands.automation.app'],
  ]) {
    const { command, args } = build({});
    const index = args.indexOf(executable);
    if (index < 0) throw new Error('Unexpected upstream Python command.');
    const result = spawnSync(command, [...args.slice(0, index), 'python', '-c', `import ${module}`], {
      cwd: temporary, timeout: 300000, stdio: 'ignore',
      env: { ...process.env, DO_NOT_TRACK: '1', AUTOMATION_DB_URL: `sqlite+aiosqlite:///${temporary}/warm.db` },
    });
    if (result.status !== 0) throw new Error(`Could not warm ${module}.`);
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
