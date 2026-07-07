import * as Sentry from "@sentry/browser";

// Sentry初期化。main.jsの最上部で最初に実行すること。
// window.onerror / unhandledrejection はinit時に自動フックされる。
const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // development / production
    release: import.meta.env.VITE_SENTRY_RELEASE, // git hash（vite.configでdefine注入）
    sampleRate: 1.0, // 初期は全件送信。エラー爆発時に下げる。
    tracesSampleRate: 0, // パフォーマンス計測は不要（別課金回避）
    sendDefaultPii: false,
    ignoreErrors: [
      "ResizeObserver loop", // 既知の無害ノイズ
      /extension:\//, // ブラウザ拡張由来
    ],
    beforeSend(event) {
      // dev環境からは送信しない
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
} else if (import.meta.env.PROD) {
  // 本番でDSN未設定は設定ミス。気付けるよう警告のみ。
  console.warn("[sentry] VITE_SENTRY_DSN 未設定のためエラー収集が無効");
}

export { Sentry };
