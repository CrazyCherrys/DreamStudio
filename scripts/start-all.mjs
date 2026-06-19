import { spawn } from 'node:child_process';

const mode = process.argv[2] === 'dev' ? 'dev' : 'start';
const targets = [
  ['web', ['run', mode, '-w', '@dreamstudio/web']],
  ['api', ['run', mode, '-w', '@dreamstudio/api']],
  ['worker', ['run', mode, '-w', '@dreamstudio/worker']],
];

const children = new Map();
let shuttingDown = false;

function prefix(name, stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length > 0) {
        process.stdout.write(`[${name}] ${line}\n`);
      }
    }
  });
}

function shutdown(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children.values()) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 1000).unref();
}

for (const [name, args] of targets) {
  const child = spawn('npm', args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.set(name, child);
  prefix(name, child.stdout);
  prefix(name, child.stderr);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!shuttingDown) {
      process.stderr.write(
        `[supervisor] ${name} exited with ${signal ?? `code ${code ?? 0}`}; stopping dreamstudio\n`,
      );
      shutdown(code ?? 1);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}
