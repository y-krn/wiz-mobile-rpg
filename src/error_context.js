import { setGameSnapshotProvider } from "./sentry.js";

// エラー発生時にSentryへ添付するゲーム状態スナップショットを構築する。
// seed + 位置 + party要約があればローカル再現が可能になる（RPGでの再現性の要）。
// PII方針: プレイヤー入力のキャラ名は再現に必須なので含める。氏名等の実PIIは扱わない前提。
function buildSnapshot(state) {
  return {
    seed: state.seed,
    gameState: state.gameState,
    floor: state.floor,
    pos: `${state.x},${state.y}`,
    dir: state.dir,
    runMaterialCount: Object.values(state.currentRun?.materials || {}).reduce((sum, quantity) => sum + quantity, 0),
    // party: 名前・Lv・HP・状態のみ。オブジェクト全体は巨大なので要約する。
    party: (state.party || []).map((c) => ({
      name: c.name,
      lv: c.level,
      hp: `${c.hp}/${c.maxHp}`,
      status: c.status,
    })),
    inRun: !!state.currentRun,
  };
}

// game初期化時に一度呼ぶ。以降beforeSendがライブstateを読んでsnapshotを生成する。
export function initErrorContext(state) {
  setGameSnapshotProvider(() => buildSnapshot(state));
}
