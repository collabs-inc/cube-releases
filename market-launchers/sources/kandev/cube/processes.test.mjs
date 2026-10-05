import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

test('session cleanup reaps owned processes and leaves unrelated processes alive', async () => {
  const { ProcessGroup } = await import('./processes.mjs');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  await once(unrelated, 'spawn');
  const group = new ProcessGroup();
  const owned = group.spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  await once(owned, 'spawn');
  try {
    await group.stop();
    assert.throws(() => process.kill(owned.pid, 0));
    assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
    await group.stop();
  } finally {
    unrelated.kill();
    await once(unrelated, 'exit');
  }
});

test('SIGHUP cleanup kills a TERM-resistant owned process before Cube escalation', async () => {
  const script = `import { ProcessGroup } from ${JSON.stringify(new URL('./processes.mjs', import.meta.url).href)};
    const group = new ProcessGroup();
    const child = group.spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)'], {stdio:['ignore','pipe','ignore']});
    child.stdout.once('data',()=>console.log(child.pid));
    process.on('SIGHUP',async()=>{await group.stop();process.exit(0)});`;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', script]);
  const [bytes] = await once(parent.stdout, 'data');
  const pid = Number(String(bytes).trim());
  const start = Date.now();
  parent.kill('SIGHUP');
  const [code] = await once(parent, 'exit');
  assert.equal(code, 0);
  assert.ok(Date.now() - start < 1800, 'cleanup must finish within the ptyd grace period');
  assert.throws(() => process.kill(pid, 0));
});
