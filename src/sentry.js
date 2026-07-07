import * as Sentry from "@sentry/browser";

// Sentry初期化。main.jsの最上部で最初に実行すること。
// window.onerror / unhandledrejection はinit時に自動フックされる。
const dsn = import.meta.env.VITE_SENTRY_DSN;

// エラー送信時に呼ばれるゲーム状態スナップショット関数。
// game側から setGameSnapshotProvider() で登録する（sentry.jsはゲームに依存しない）。
let snapshotProvider = null;

// ライブなゲーム状態を返す関数を登録する。beforeSendがエラー発生時に呼ぶ。
export function setGameSnapshotProvider(fn) {
  snapshotProvider = fn;
}

// ゲーム内イベントをbreadcrumbとして記録する薄いラッパ。
// Sentry未初期化でも安全（no-op）。SDKデフォルトのclick/console履歴に上乗せする。
export function addGameBreadcrumb(category, message, data) {
  if (!dsn) return;
  Sentry.addBreadcrumb({ category, message, data, level: "info" });
}

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
      // エラー発生時点のゲーム状態を context として添付（再現性のため）。
      // 状態取得中の例外でエラー送信自体を潰さないよう握りつぶす。
      if (snapshotProvider) {
        try {
          event.contexts = { ...event.contexts, game: snapshotProvider() };
        } catch {
          // snapshot失敗は無視（元イベントは送る）
        }
      }
      return event;
    },
  });
} else if (import.meta.env.PROD) {
  // 本番でDSN未設定は設定ミス。気付けるよう警告のみ。
  console.warn("[sentry] VITE_SENTRY_DSN 未設定のためエラー収集が無効");
}

export { Sentry };
