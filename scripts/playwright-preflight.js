import { createHash } from 'node:crypto';
import process from 'node:process';
import path from 'node:path';
import {
  collectDiagnostics,
  formatDiagnostics,
  formatRecoveryGuidance,
  inspectPort,
  resolveWorkerCount,
} from './playwright-diagnostics.js';

const projectPath = `${path.resolve(process.cwd())}${path.sep}`;
const defaultPort = 10000 + (createHash('sha256').update(projectPath).digest().readUInt32BE(0) % 10000);
const port = Number(process.argv[2] || process.env.PLAYWRIGHT_PORT || defaultPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[playwright-diagnostics] invalid preflight port: ${process.argv[2] || process.env.PLAYWRIGHT_PORT || 'missing'}`);
  process.exitCode = 1;
} else {
  const worker = resolveWorkerCount();
  const baseURL = `http://127.0.0.1:${port}`;
  const status = await inspectPort(port);
  const diagnostics = collectDiagnostics({
    baseURL,
    port,
    workerCount: worker.count,
    workerSource: worker.source,
    portStatus: status.available ? 'available' : `${status.error?.code || 'occupied'} (collision or permission failure)`,
  });

  if (!status.available) {
    console.error(formatDiagnostics(diagnostics));
    console.error(`[playwright-diagnostics] port collision target: 127.0.0.1:${port}`);
    if (status.error?.code === 'EACCES' || status.error?.code === 'EPERM') {
      console.error(formatRecoveryGuidance({ ...diagnostics, launchError: status.error.message }));
    }
    process.exitCode = 1;
  } else {
    console.error(`[playwright-diagnostics] preflight: port ${port} available; worker count ${worker.count}`);
  }
}
