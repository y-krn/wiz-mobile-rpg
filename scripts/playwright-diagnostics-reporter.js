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
    if (process.env.ISSUE_1471_MEASUREMENT === '1') {
      console.log(`[issue-1471-result] ${JSON.stringify({
        title: _test.title,
        file: _test.location?.file,
        status: result.status,
        durationMs: result.duration,
        retry: result.retry,
        workerIndex: result.workerIndex,
        errors: (result.errors || []).map(error => error.message || String(error)),
        attachments: (result.attachments || []).map(attachment => ({ name: attachment.name, path: attachment.path })),
      })}`);
    }
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
