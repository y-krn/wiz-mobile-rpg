import * as Sentry from "@sentry/browser";

// Sentry初期化。main.jsの最上部で最初に実行すること。
// window.onerror / unhandledrejection はinit時に自動フックされる。
//
// import.meta.env はVite専用で、Viteを経由しない生Node実行(npm run test:unit)では
// 未定義になる。プロパティ直接アクセスはTypeErrorになるため、必ずviteEnv経由で参照する。
const viteEnv = import.meta.env ?? {};
const dsn = viteEnv.VITE_SENTRY_DSN;

// ローカル環境判定。dev(vite dev)/preview(本番ビルドのローカル配信)/
// --host経由のLAN実機(スマホ確認)を全て抑止し、Vercel本番ドメインのみ送信する。
function isLocalEnv() {
  if (viteEnv.DEV) return true; // vite dev
  if (typeof location === "undefined") return false;
  const h = location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    // プライベートIP帯(LAN実機テスト): 10.x / 192.168.x / 172.16〜31.x
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
  );
}

// Sentryを有効化する条件: DSN設定済み かつ 非ローカル環境。
// この単一フラグで init と breadcrumb 記録をまとめて制御する。
const enabled = !!dsn && !isLocalEnv();

// エラー送信時に呼ばれるゲーム状態スナップショット関数。
// game側から setGameSnapshotProvider() で登録する（sentry.jsはゲームに依存しない）。
let snapshotProvider = null;

// ライブなゲーム状態を返す関数を登録する。beforeSendがエラー発生時に呼ぶ。
export function setGameSnapshotProvider(fn) {
  snapshotProvider = fn;
}

// ゲーム内イベントをbreadcrumbとして記録する薄いラッパ。
// 無効時(ローカル/DSN無)はno-op。SDKデフォルトのclick/console履歴に上乗せする。
export function addGameBreadcrumb(category, message, data) {
  if (!enabled) return;
  Sentry.addBreadcrumb({ category, message, data, level: "info" });
}

if (!enabled) {
  if (viteEnv.PROD && !dsn && !isLocalEnv()) {
    // 本番ドメインでDSN未設定は設定ミス。気付けるよう警告のみ。
    console.warn("[sentry] VITE_SENTRY_DSN 未設定のためエラー収集が無効");
  }
  // ローカル環境ではinitごとスキップ→session等も含め一切送信しない。
} else {
  Sentry.init({
    dsn,
    environment: viteEnv.MODE, // development / production
    release: viteEnv.VITE_SENTRY_RELEASE, // git hash（vite.configでdefine注入）
    sampleRate: 1.0, // 初期は全件送信。エラー爆発時に下げる。
    tracesSampleRate: 0, // パフォーマンス計測は不要（別課金回避）
    sendDefaultPii: false,
    ignoreErrors: [
      "ResizeObserver loop", // 既知の無害ノイズ
      /extension:\//, // ブラウザ拡張由来
    ],
    beforeSend(event) {
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
}

export { Sentry };
