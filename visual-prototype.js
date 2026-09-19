/* global document, history, URLSearchParams, window */

// balance-impact: none — isolated visual prototype fixture; production rules are unchanged.

const FIXTURE = Object.freeze({
  floor: "B1F",
  location: "リルガミンの街",
  hp: "18 / 24",
  mp: "7 / 12",
  bag: "14 / 20",
  enemy: "黒曜の番兵",
  enemyHp: "32 / 48",
  item: "霧銀の短剣",
  itemEffect: "効果は未確認",
  itemComparison: "ATK 18  →  23",
  event: "【気配】遠くで、金属を引きずる音がした。",
});

const STATES = Object.freeze({
  town: {
    eyebrow: "TOWN / READY",
    title: "次の潜行に備える",
    description: "持ち込むものを決め、まだ確定していない戦果へ向かう。",
    scene: "街の灯り",
    event: "前回の冒険: B1Fから帰還。霧銀の短剣を持ち帰った。",
    actions: [
      { label: "準備を整える", detail: "開始キットと開始地点を選ぶ", role: "primary" },
      { label: "冒険記録を見る", detail: "おしろ — 何が起きたか", role: "secondary" },
      { label: "迷宮について分かったこと", detail: "書庫 — Codex", role: "secondary" },
    ],
  },
  preparation: {
    eyebrow: "PREPARATION / UNCOMMITTED",
    title: "開始キットと開始地点を選ぶ",
    description: "まだ世界へ作用していない選択。戻ると準備を破棄する。",
    scene: "出発前の作業台",
    event: "開始キット: 鋼の前線キット / 開始地点: B1F",
    actions: [
      { label: "鋼の前線キット", detail: "HP 24 / MP 12 / 回復薬 2", role: "selected", pressed: true },
      { label: "B1Fから開始", detail: "迷宮へ向かう", role: "primary" },
      { label: "戻る", detail: "選択を破棄", role: "back" },
    ],
  },
  explore: {
    eyebrow: "B1F / EXPLORE",
    title: "前へ進む",
    description: "見えている事実だけを頼りに、次の一歩を選ぶ。",
    scene: "地下1階 / 未知の通路",
    event: FIXTURE.event,
    actions: [
      { label: "左旋回", role: "secondary" },
      { label: "進む", role: "primary" },
      { label: "右旋回", role: "secondary" },
      { label: "後退", role: "secondary" },
      { label: "調べる", role: "secondary" },
      { label: "バッグ", role: "secondary" },
      { label: "魔法", role: "secondary" },
      { label: "装備", role: "secondary" },
    ],
  },
  combat: {
    eyebrow: "B1F / COMBAT",
    title: FIXTURE.enemy,
    description: "戦闘を続ければ、HPを失う可能性がある。逃走も、確実な帰還ではない。",
    scene: "敵影 / 対峙中",
    event: `HP ${FIXTURE.hp} / MP ${FIXTURE.mp} / 敵HP ${FIXTURE.enemyHp}`,
    actions: [
      { label: "攻撃", role: "primary" },
      { label: "魔法", role: "secondary" },
      { label: "道具", role: "secondary" },
      { label: "防御", role: "secondary" },
      { label: "逃走", role: "danger" },
      { label: "キャンセル", role: "back" },
    ],
  },
  loot: {
    eyebrow: "B1F / LOOT",
    title: "見つけたものをどうするか",
    description: "知らない効果を試すか、いまの装備を守るか。判断は確定前に戻れる。",
    scene: "戦闘後 / 残響",
    event: `戦果候補: ${FIXTURE.item} / バッグ ${FIXTURE.bag}`,
    actions: [
      { label: "霧銀の短剣", detail: FIXTURE.itemEffect, role: "selected", pressed: true },
      { label: "拾う", detail: FIXTURE.itemComparison, role: "primary" },
      { label: "見送る", detail: "いまの装備を維持", role: "secondary" },
      { label: "戻る", detail: "選択を破棄", role: "back" },
    ],
  },
  portal: {
    eyebrow: "B1F / PORTAL",
    title: "戦果を確定するか、さらに賭けるか",
    description: "帰還すれば現在の戦果が確定する。Pushすれば次のPortalまで再び賭ける。",
    scene: "帰還門 / 目の前",
    event: `持ち帰り候補 ${FIXTURE.bag} / HP ${FIXTURE.hp} / MP ${FIXTURE.mp}`,
    actions: [
      { label: "帰還", detail: "現在の戦果を確定", role: "choice" },
      { label: "Push", detail: "次のPortalまで再び賭ける", role: "choice" },
      { label: "戻る", detail: "Portal選択を破棄", role: "back" },
    ],
  },
  "portal-confirm": {
    eyebrow: "B1F / PORTAL / CONFIRM",
    title: "帰還を確定しますか",
    description: "選択中: 帰還。現在の戦果を確定する。戻るとPortalの選択へ戻る。",
    scene: "帰還門 / 確定前",
    event: `選択中: 帰還 / 持ち帰り候補 ${FIXTURE.bag}`,
    actions: [
      { label: "帰還", detail: "選択中", role: "selected", pressed: true },
      { label: "帰還を確定", detail: "現在の戦果を確定", role: "primary" },
      { label: "戻る", detail: "Portalの選択へ戻る", role: "back" },
    ],
  },
  return: {
    eyebrow: "RESULT / RETURN",
    title: "帰還した",
    description: "今回の戦果は確定した。次の潜行では、持ち帰ったものを使える。",
    scene: "街 / 帰還",
    event: `確定した戦果: ${FIXTURE.item} / 深度: ${FIXTURE.floor}`,
    actions: [
      { label: "霧銀の短剣", detail: "街から持ち込める品", role: "reward" },
      { label: "街へ戻る", detail: "次の準備へ", role: "primary" },
    ],
  },
  death: {
    eyebrow: "RESULT / DEATH",
    title: "冒険者は倒れた",
    description: "未確定の戦果は失われる。街から持ち込んだ品は失われない。",
    scene: "地下1階 / 静寂",
    event: `失われた戦果: ${FIXTURE.item} / 最後のHP: 0 / 24`,
    actions: [
      { label: "失われた戦果", detail: FIXTURE.item, role: "lost" },
      { label: "街へ戻る", detail: "次の準備へ", role: "primary" },
    ],
  },
});

const THEMES = Object.freeze({
  dark: { name: "Current Dark Archive proxy", note: "current token/font baseline / actual production screenshot別参照" },
  modern: { name: "Bright Modern Arcane", note: "鉱物色の明るい面 / 高彩度の魔術光" },
  warm: { name: "Pop / Warm Adventure", note: "暖色の地図 / 親しみある形 / 強い感情差" },
});

const root = document.getElementById("prototype-root");
const stage = document.getElementById("prototype-stage");
const stateSelect = document.getElementById("state-select");
const query = new URLSearchParams(window.location.search);
let currentTheme = THEMES[query.get("theme")] ? query.get("theme") : "dark";
let currentState = STATES[query.get("state")] ? query.get("state") : "town";

function actionMarkup(action, index) {
  const detail = action.detail ? `<small>${action.detail}</small>` : "";
  const stateLabel = { selected: "選択中", danger: "危険", lost: "喪失" }[action.role];
  const stateMarkup = stateLabel ? `<em class="action-state">${stateLabel}</em>` : "";
  const pressed = action.pressed ? ' aria-pressed="true"' : "";
  return `<button type="button" class="fixture-action fixture-action--${action.role}" data-action-index="${index}"${pressed}>${stateMarkup}<span>${action.label}</span>${detail}</button>`;
}

function render() {
  const fixture = STATES[currentState];
  root.dataset.theme = currentTheme;
  root.dataset.state = currentState;
  stateSelect.value = currentState;
  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    const isCurrent = button.dataset.themeChoice === currentTheme;
    button.setAttribute("aria-pressed", String(isCurrent));
  });
  stage.innerHTML = `
    <div class="direction-caption">
      <div><span class="direction-letter">${currentTheme === "dark" ? "A" : currentTheme === "modern" ? "B" : "C"}</span><strong>${THEMES[currentTheme].name}</strong></div>
      <span>${THEMES[currentTheme].note}</span>
    </div>
    <section class="game-shell" aria-label="${fixture.title} / ${THEMES[currentTheme].name}">
      <header class="minimal-hud" aria-label="状態">
        <div class="brand-lockup"><span class="brand-mark" aria-hidden="true">✦</span><span>DEPTHWARD</span></div>
        <div class="hud-facts"><span>${FIXTURE.floor}</span><span>HP <strong>${FIXTURE.hp}</strong></span><span>MP <strong>${FIXTURE.mp}</strong></span></div>
      </header>
      <div class="dungeon-view" data-scene="${currentState}" aria-label="${fixture.scene}">
        <div class="scene-grid" aria-hidden="true"></div>
        <div class="scene-insignia" aria-hidden="true">◈</div>
        <div class="scene-copy"><span class="state-badge">${fixture.eyebrow}</span><strong>${fixture.scene}</strong><span>${fixture.title}</span></div>
        ${currentState === "combat" ? `<div class="enemy-frame"><span>敵影</span><strong>${FIXTURE.enemy}</strong><small>HP ${FIXTURE.enemyHp}</small></div>` : ""}
      </div>
      <section class="current-event-strip" aria-label="現在の出来事">
        <span class="event-pin" aria-hidden="true">◆</span><p>${fixture.event}</p><button type="button" class="log-button" aria-label="全ログを表示">ログ</button>
      </section>
      <section class="decision-surface" aria-labelledby="decision-title">
        <div class="decision-heading"><div><span class="decision-kicker">${fixture.eyebrow}</span><h2 id="decision-title">${fixture.title}</h2></div><p>${fixture.description}</p></div>
        <div class="action-dock" aria-label="操作">${fixture.actions.map(actionMarkup).join("")}</div>
      </section>
      <footer class="character-panel" aria-label="冒険者の状態">
        <div class="vital"><span>HP</span><div class="meter"><i style="width:75%"></i></div><strong>${FIXTURE.hp}</strong></div>
        <div class="vital"><span>MP</span><div class="meter meter--mp"><i style="width:58%"></i></div><strong>${FIXTURE.mp}</strong></div>
        <div class="bag-fact"><span>バッグ</span><strong>${FIXTURE.bag}</strong></div>
      </footer>
    </section>`;
}

document.querySelectorAll("[data-theme-choice]").forEach(button => {
  button.addEventListener("click", () => {
    currentTheme = button.dataset.themeChoice;
    render();
    history.replaceState(null, "", `?theme=${currentTheme}&state=${currentState}`);
  });
});

stateSelect.addEventListener("change", event => {
  currentState = event.target.value;
  render();
  history.replaceState(null, "", `?theme=${currentTheme}&state=${currentState}`);
});

render();
