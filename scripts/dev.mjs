import { spawn } from 'node:child_process';

const children = ['backend', 'frontend'].map((workspace) =>
  spawn('npm', ['run', 'dev', '--workspace', workspace], { stdio: 'inherit' }),
);
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code, signal) => { if (!stopping) stop(code ?? (signal ? 1 : 0)); });
}
process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
