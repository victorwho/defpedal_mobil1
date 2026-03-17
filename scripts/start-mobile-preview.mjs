#!/usr/bin/env node

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const skipSync = args.includes('--skip-sync');
const forwardedArgs = args.filter((arg) => arg !== '--skip-sync');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const runCommand = (command, commandArgs, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('exit', (code, signal) => {
      if (typeof code === 'number' && code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${commandArgs.join(' ')} exited with ${
            signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
          }.`,
        ),
      );
    });

    child.on('error', reject);
  });

try {
  if (!skipSync) {
    await runCommand(process.execPath, ['./scripts/sync-mobile-preview-url.mjs']);
  }

  await runCommand(
    npmCommand,
    ['run', 'start', '--workspace', '@defensivepedal/mobile', '--', ...forwardedArgs],
    {
      env: {
        ...process.env,
        APP_VARIANT: 'preview',
        EXPO_PUBLIC_APP_ENV: 'staging',
      },
    },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Preview mobile start failed.');
  process.exit(1);
}
