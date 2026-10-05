import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
export class ProcessGroup {
  children = [];
  stopping = false;
  onUnexpectedExit = () => {};
  spawn(command, args = [], options = {}) {
    const child = spawn(command, args, { stdio: 'ignore', ...options, detached: true });
    const record = { child, done: new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); }) };
    this.children.push(record);
    child.once('error', error => { if (!this.stopping) this.onUnexpectedExit(error); });
    child.once('exit', code => { if (!this.stopping) this.onUnexpectedExit(new Error(`${command} exited (${code}).`)); });
    return child;
  }
  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    const descendants = new Set(this.children.map(({ child }) => child.pid).filter(Boolean));
    try {
      const { stdout } = await run('ps', ['-eo', 'pid=,ppid='], { timeout: 200 });
      const rows = stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
      for (let previous = -1; previous !== descendants.size;) {
        previous = descendants.size;
        for (const [pid, parent] of rows) if (descendants.has(parent)) descendants.add(pid);
      }
    } catch {}
    const signal = value => {
      for (const { child } of [...this.children].reverse()) {
        if (child.pid) try { process.kill(-child.pid, value); } catch {}
      }
      for (const pid of [...descendants].reverse()) try { process.kill(pid, value); } catch {}
    };
    signal('SIGTERM');
    let timer;
    await Promise.race([
      Promise.all(this.children.map(record => record.done)),
      new Promise(resolve => { timer = setTimeout(resolve, 900); }),
    ]);
    clearTimeout(timer);
    signal('SIGKILL');
    await Promise.all(this.children.map(record => record.done));
  }
}
