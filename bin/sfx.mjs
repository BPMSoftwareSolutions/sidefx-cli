#!/usr/bin/env node
import { runCli } from '../src/cli.mjs';

// A downstream consumer closing a pipe is an ordinary terminal operation.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', error => { if (error.code === 'EPIPE') process.exit(0); throw error; });
}
process.exitCode = await runCli(process.argv.slice(2));
