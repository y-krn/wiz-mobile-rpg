import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// git short hash をリリース識別子にする。SDK側(Sentry.init)と揃えて
// regression検知・バージョン特定を可能にする。
// execFileSync: shellを介さず引数配列で渡すためコマンドインジェクション不可。
const release = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"])
      .toString()
      .trim();
  } catch {
    return undefined; // git無し環境でもビルドは通す
  }
})();

export default defineConfig({
  define: {
    // ブラウザSDKへ埋め込む。plugin側のrelease名と一致させる。
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release),
  },
  build: {
    sourcemap: true, // Source map generation must be turned on
  },
  plugins: [
    // Put the Sentry vite plugin after all other plugins
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "wiz-mobile-rpg",
      project: "javascript",
      release: { name: release },
      sourcemaps: {
        // upload後にmapを削除し、公開配信(dist/*.map)によるソース露出を防ぐ。
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
    }),
  ],
});
