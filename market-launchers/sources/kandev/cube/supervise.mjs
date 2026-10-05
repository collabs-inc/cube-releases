import { ProcessGroup } from './processes.mjs';

// The upstream launcher handles TERM/INT, but Cube starts shutdown with HUP.
// Track its separately grouped backend descendants before beginning teardown.
const group = new ProcessGroup();
let stopping;
async function stop(code) {
  if (stopping) return stopping;
  stopping = group.stop().then(() => process.exit(code));
  return stopping;
}
group.onUnexpectedExit = error => { console.error(error.message); void stop(1); };
for (const signal of ['SIGHUP', 'SIGTERM', 'SIGINT']) process.on(signal, () => void stop(0));
group.spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit' });
