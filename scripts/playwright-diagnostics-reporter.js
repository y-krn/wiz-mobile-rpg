import {
  formatLaunchFailureDiagnostics,
  isChromiumLaunchFailure,
  resolveWorkerCount,
} from './playwright-diagnostics.js';

class PlaywrightDiagnosticsReporter {
  constructor() {
    this.context = {};
    this.reportedErrors = new Set();
  }

  onBegin(config) {
    const project = config.projects[0];
    const baseURL = project?.use?.baseURL;
    this.context = {
      baseURL,
      port: baseURL ? new URL(baseURL).port : undefined,
      workerCount: config.workers,
      workerSource: resolveWorkerCount().source,
    };
  }

  onError(error) {
    this.reportLaunchFailure(error);
  }

  onTestEnd(_test, result) {
    for (const error of result.errors || []) {
      this.reportLaunchFailure(error);
    }
  }

  reportLaunchFailure(error) {
    const errorText = error?.message || String(error);
    if (!isChromiumLaunchFailure(errorText) || this.reportedErrors.has(errorText)) return;
    this.reportedErrors.add(errorText);
    console.error(formatLaunchFailureDiagnostics({ error, ...this.context }));
  }
}

export default PlaywrightDiagnosticsReporter;
