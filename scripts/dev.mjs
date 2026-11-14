import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const children = ['backend', 'frontend'].map((workspace) =>
  spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev', '--workspace', workspace], {
    stdio: 'inherit',
    detached: !isWindows,
    shell: isWindows
  }),
);
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(`No se pudo iniciar un workspace de desarrollo: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => { if (!stopping) stop(code ?? (signal ? 1 : 0)); });
}
process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
