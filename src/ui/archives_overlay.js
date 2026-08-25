import { state, createDefaultCodex } from "../state.js";
import { getMonsterResistanceStatus, getClassJpName, getAffixDefinition, MONSTERS, ITEMS } from "../data.js";
import { updateUI } from "./ui_root.js";
import { FLOOR_THEMES, getFloorDisplayName } from "../data/floor_themes.js";

export const archivesState = {
  tab: "monsters",
  selectedId: null,
  listScrollTop: 0
};

function getRunOutcomeLabel(run) {
  if (run?.outcome === "abandon" || (!run?.outcome && run?.returnReason === "abandon")) return "断念";
  if (run?.outcome === "death" || (!run?.outcome && run?.returnReason === "gameover")) return "死亡";
  return "撤退";
}

function getRunOutcomeColor(run) {
  return getRunOutcomeLabel(run) === "撤退" ? "var(--neon-green)" : "var(--neon-red)";
}

function trackArchivesListScroll(body) {
  body.addEventListener("scroll", () => {
    if (!body.isConnected) return;
    archivesState.listScrollTop = body.scrollTop;
  }, { passive: true });
}

export function getMonsterCodexDetailHtml(m, record) {
  const enc = record ? record.encountered : 0;
  const kil = record ? record.killed : 0;
  
  if (enc === 0) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">遭遇したことがありません</div>`;
  }
  
  const observedActions = Array.isArray(record?.observedActions) ? record.observedActions : [];
  const observedConditions = Array.isArray(record?.observedConditions) ? record.observedConditions : [];
  const observedLoot = Array.isArray(record?.observedLoot) ? record.observedLoot : [];
  const floorHistory = Object.entries(record?.encounterFloors || {})
    .map(([floor, count]) => [Number(floor), Number(count)])
    .filter(([floor, count]) => Number.isInteger(floor) && floor > 0 && count > 0)
    .sort((a, b) => a[0] - b[0]);
  const firstFloor = Number(record?.firstEncounterFloor) || floorHistory[0]?.[0] || 0;
  const lastFloor = Number(record?.lastEncounterFloor) || floorHistory.at(-1)?.[0] || 0;
  const roleLabels = {
    aggressor: "攻撃役",
    disruptor: "妨害役",
    amplifier: "支援役"
  };
  const observedList = (values, emptyText) => `
    <ul class="codex-observation-list">
      ${values.map(value => `<li>${value}</li>`).join("")}
      <li class="codex-unknown">???</li>
    </ul>
    ${values.length === 0 ? `<p class="codex-muted">${emptyText}</p>` : ""}
  `;
  const resistanceRows = getMonsterResistanceStatus(m, record)
    .map(({ label, known, description }) => `
      <div class="codex-observation-row">
        <span>${label}</span>
        <strong class="${known ? "is-known" : "is-unknown"}">${known ? description : "未確認"}</strong>
      </div>
    `).join("");
  const floorRows = floorHistory.length > 0
    ? floorHistory.map(([floor, count]) => `<li>B${floor}F <span>${count}回</span></li>`).join("")
    : `<li class="codex-muted">階層履歴は旧記録のため残っていません</li>`;

  let html = `<div class="codex-detail">`;
  html += `
    <div class="codex-detail-header">
      <span class="codex-detail-name">${m.name}</span>
      <span class="codex-meta">遭遇: ${enc} / 撃破: ${kil}</span>
    </div>
    <div class="codex-detail-body">
      <section class="codex-info-section">
        <div class="codex-subtitle">生態</div>
        <p><strong>分類:</strong> ${roleLabels[m.role] || "未分類"}${m.isRare ? " / 希少な遭遇" : ""}</p>
        <p><strong>初遭遇:</strong> ${firstFloor ? `B${firstFloor}F` : "未記録"}</p>
        <div class="codex-floor-history"><strong>遭遇した階層</strong><ul>${floorRows}</ul></div>
      </section>
      <section class="codex-info-section">
        <div class="codex-subtitle">行動</div>
        ${observedList(observedActions, "実戦で確認した行動はまだありません。")}
        ${observedConditions.length > 0 ? `<p class="codex-observation-label">受けた特徴</p>${observedList(observedConditions, "")}` : ""}
      </section>
      <section class="codex-info-section">
        <div class="codex-subtitle">耐性・弱点</div>
        <div class="codex-observation-grid">${resistanceRows}</div>
      </section>
      <section class="codex-info-section">
        <div class="codex-subtitle">確認した戦利品</div>
        ${observedList(observedLoot, "実際に得た戦利品はまだありません。")}
      </section>
      <section class="codex-info-section codex-personal-record">
        <div class="codex-subtitle">あなたの記録</div>
        <p>遭遇: ${enc}回 / 撃破: ${kil}回</p>
        <p>最後に遭遇: ${lastFloor ? `B${lastFloor}F` : "未記録"}</p>
      </section>
  `;
  html += `</div></div>`;
  return html;
}

const EQUIPMENT_TAG_LABELS = {
  fire: "🔥 炎",
  blade: "⚔️ 刀剣",
  poison: "☠️ 毒",
  ambush: "🗡️ 奇襲",
  ward: "🛡️ 守護",
  spirit: "🔮 霊術",
  holy: "✦ 聖",
  iron: "⛓️ 鉄",
  dragon: "🐉 竜",
  beast: "🐾 獣",
  evasion: "🌑 回避",
  search: "🔎 探索",
  trap: "⚠️ 罠",
  analysis: "📖 解析",
  curse: "🜏 呪",
  blood: "🩸 血",
  decay: "☾ 衰弱",
  fire_rite: "🔥 火葬"
};

const EQUIPMENT_RESEARCH_AFFIXES = {
  fire: ["firstTurnAttack", "fullHpDamage", "deepAssault"],
  blade: ["atk", "followUp", "firstTurnAttack"],
  poison: ["poisonAtk", "poisonWard", "statusResistance"],
  ambush: ["firstStrike", "firstTurnAttack", "rearEvasion"],
  ward: ["def", "guardian", "spellGuard"],
  spirit: ["spellPower", "arcane", "devotion"],
  holy: ["antiUndead", "antiDemon", "devotion"],
  dragon: ["antiDragon", "spellGuard"],
  trap: ["trapBonus", "traceRead"],
  search: ["treasureSense", "hearRange"],
  analysis: ["arcaneSense", "spellAccuracy"]
};

function getEquipmentTypeLabel(type) {
  return type === "weapon" ? "武器" : type === "shield" ? "盾" : type === "accessory" ? "装飾" : "防具";
}

function getKnownEquipmentTagIds(item, record) {
  const observations = record?.tagObservations;
  if (!observations || typeof observations !== "object") return [];
  return (item.tags || [])
    .filter(tag => Number(observations[tag]) >= 2 && EQUIPMENT_TAG_LABELS[tag]);
}

function getKnownEquipmentTags(item, record) {
  return getKnownEquipmentTagIds(item, record).map(tag => EQUIPMENT_TAG_LABELS[tag]);
}

function getEquipmentFoundFloors(record) {
  const floors = Object.entries(record?.foundFloors || {})
    .map(([floor, count]) => [Number(floor), Number(count)])
    .filter(([floor, count]) => Number.isInteger(floor) && floor > 0 && count > 0)
    .sort((a, b) => a[0] - b[0]);
  if (floors.length > 0) return floors;

  const match = String(record?.firstFoundAt || "").match(/^B(\d+)F$/);
  return match ? [[Number(match[1]), 1]] : [];
}

function getEquipmentAffixDetails(record) {
  return (Array.isArray(record?.affixesSeen) ? record.affixesSeen : [])
    .map(affixId => getAffixDefinition(affixId))
    .filter(Boolean)
    .map(definition => `<li><strong>${definition.jpName}</strong><span>${definition.desc}</span></li>`)
    .join("");
}

function getEquipmentResearchHtml(item, record) {
  const knownTags = getKnownEquipmentTagIds(item, record);
  if (knownTags.length === 0) {
    return `<p class="codex-muted">系統は、同じ装備をもう一度観測すると研究記録に加わります。</p>`;
  }

  const notes = [];
  if (knownTags.includes("fire")) notes.push("炎系の装備。初動や火力を伸ばす特性との組み合わせを試す余地がある。");
  if (knownTags.includes("blade")) notes.push("刀剣の扱いに向く装備。攻撃や追撃を重ねる構成で手応えが変わりそうだ。");
  if (knownTags.includes("poison")) notes.push("毒に関わる装備。付与と耐性のどちらを伸ばすかで役割が変わる。");
  if (knownTags.includes("ambush")) notes.push("奇襲向きの装備。先制や初手を活かす探索方針と相性がよい。");
  if (knownTags.includes("ward")) notes.push("守護系の装備。防御や被害軽減を重ねる研究に向く。");
  if (knownTags.includes("spirit") || knownTags.includes("holy")) notes.push("術式・聖別の気配がある。呪文や対魔の特性と組み合わせて観測したい。");
  if (knownTags.includes("trap") || knownTags.includes("search")) notes.push("探索補助の系統。罠や宝の発見を重ねる旅で違いが出る可能性がある。");

  const knownAffixIds = new Set(Array.isArray(record?.affixesSeen) ? record.affixesSeen : []);
  const relatedAffixes = [...new Set(knownTags.flatMap(tag => EQUIPMENT_RESEARCH_AFFIXES[tag] || []))]
    .filter(affixId => knownAffixIds.has(affixId))
    .map(affixId => getAffixDefinition(affixId)?.jpName)
    .filter(Boolean);
  if (relatedAffixes.length > 0) {
    notes.push(`関連して記録した特性: ${relatedAffixes.join(" / ")}`);
  }

  return notes.map(note => `<p>${note}</p>`).join("");
}

export function getEquipmentCodexDetailHtml(itemKey, record) {
  const item = ITEMS[itemKey];
  if (!item || !record) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">入手したことがありません</div>`;
  }

  const foundFloors = getEquipmentFoundFloors(record);
  const knownTags = getKnownEquipmentTags(item, record);
  const affixDetails = getEquipmentAffixDetails(record);
  const classes = item.classes?.map(getClassJpName).join("・") || "全員";
  const baseStat = item.atk !== undefined
    ? `<p><strong>基礎攻撃力:</strong> ${item.atk}</p>`
    : item.def !== undefined
      ? `<p><strong>基礎防御力:</strong> ${item.def}</p>`
      : "";

  let html = `<div class="codex-detail">`;
  html += `
    <div class="codex-detail-header">
      <span class="codex-detail-name">${item.name}</span>
      <span class="codex-meta">${getEquipmentTypeLabel(item.type)}</span>
    </div>
    <div class="codex-detail-body">
      <div class="codex-info-section">
        <div class="codex-subtitle">基本情報</div>
        ${baseStat}
        <p><strong>装備可能:</strong> ${classes}</p>
        <p class="codex-item-description">${item.desc || "説明は記録されていない。"}</p>
      </div>
      <div class="codex-info-section">
        <div class="codex-subtitle">発見した特性</div>
        ${affixDetails ? `<ul class="codex-affixes">${affixDetails}</ul>` : `<p class="codex-muted">まだ特性の詳細は記録されていません。</p>`}
      </div>
      <div class="codex-info-section">
        <div class="codex-subtitle">系統・研究</div>
        ${knownTags.length > 0 ? `<div class="codex-tags">${knownTags.map(tag => `<span>${tag}</span>`).join("")}</div>` : ""}
        ${getEquipmentResearchHtml(item, record)}
      </div>
      <div class="codex-info-section">
        <div class="codex-subtitle">発見記録</div>
        ${foundFloors.length > 0
          ? foundFloors.map(([floor, count]) => `<div class="codex-floor-record"><span>B${floor}F</span><span class="codex-dots">${"●".repeat(Math.min(12, count))}</span><span>${count}回</span></div>`).join("")
          : `<p class="codex-muted">階層別の記録はありません。</p>`}
      </div>
      <div class="codex-info-section codex-personal-record">
        <div class="codex-subtitle">個人記録</div>
        <p>入手 ${record.foundCount || 0}回 / 最高 <span class="${record.highestRarity || "common"}">${(record.highestRarity || "common").toUpperCase()}</span> +${record.bestBonus || 0}</p>
        <p>初発見階層: ${record.firstFoundAt || "不明"}</p>
      </div>
    </div>
  </div>`;
  return html;
}

export function getEventsCodexHtml() {
  const ev = state.codex?.events || createDefaultCodex().events;
  
  let html = `<div style="display: flex; flex-direction: column; gap: 8px; font-family: var(--font-mono); font-size: 11px;">`;
  html += `<div><div class="archives-section-title">🗺️ 場所の記録</div>`;
  Object.keys(FLOOR_THEMES).forEach(floor => {
    const name = getFloorDisplayName(state, Number(floor));
    html += `<div style="background-color: #1a1a24; border: 1px solid #333; padding: 6px; border-radius: 4px; margin-bottom: 4px;"><strong>${name}</strong> <span style="color: var(--text-muted);">地下${floor}階</span></div>`;
  });
  html += `</div>`;
  
  // 罠セクション
  html += `<div><div class="archives-section-title">⚠️ 罠の遭遇記録</div>`;
  const trapKeys = Object.keys(ev.traps || {});
  trapKeys.forEach(k => {
    const record = ev.traps[k];
    const hasRecord = record.disarmed > 0 || record.triggered > 0;
    const firstFloorLabel = record.firstFloor > 0 ? `B${record.firstFloor}F` : (hasRecord ? "記録なし" : "未発見");
    const nameJp = k === "poison needle" ? "毒針" :
                   k === "gas bomb" ? "ガス爆弾" :
                   k === "teleporter" ? "テレポーター" :
                   k === "flash bomb" ? "閃光弾" :
                   k === "pitfall" ? "落とし穴" : k;
    html += `
      <div style="background-color: #1a1a24; border: 1px solid #333; padding: 6px; border-radius: 4px; margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span><strong>${nameJp}</strong> (初発見: ${firstFloorLabel})</span>
        <span>解除: ${record.disarmed} 回 / 被弾: ${record.triggered} 回</span>
      </div>
    `;
  });
  html += `</div>`;
  

  
  // 施設セクション
  html += `<div><div class="archives-section-title">🏛️ 施設・イベント発見</div>`;
  const fac = ev.facilities || {};
  const spring = fac.spring || { found: 0, used: 0 };
  const merchant = fac.merchant || { found: 0, purchased: 0 };
  const tablet = fac.tablet || { found: 0, read: 0 };
  const chest = fac.chest || { found: 0, opened: 0 };
  
  html += `
    <div style="background-color: #1a1a24; border: 1px solid #333; padding: 6px; border-radius: 4px; display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; justify-content: space-between;">
        <span>⛲ 神秘の泉</span>
        <span>発見: ${spring.found} 回 / 使用: ${spring.used} 回</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>👤 さまよう商人</span>
        <span>発見: ${merchant.found} 回 / 購入: ${merchant.purchased} 回</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>🪦 古代の石碑</span>
        <span>発見: ${tablet.found} 回 / 解読: ${tablet.read} 回</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>📦 宝箱</span>
        <span>発見: ${chest.found} 回 / 開封: ${chest.opened} 回</span>
      </div>
    </div>
  `;
  html += `</div>`;
  
  // スタッツセクション
  const stats = state.codex?.stats || { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
  const records = state.records || { deepestRetreat: 0, deepestDeath: 0, deepestByClass: {}, totalRuns: 0 };
  const classRecords = Object.entries(records.deepestByClass || {})
    .sort((a, b) => b[1] - a[1])
    .map(([className, floor]) => `${getClassJpName(className)}: B${floor}F`)
    .join(" / ") || "記録なし";
  html += `<div><div class="archives-section-title">📊 累計スタッツ</div>`;
  html += `
    <div style="background-color: #14141a; border: 1px solid var(--neon-cyan); border-radius: 4px; padding: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      <div>潜行回数: <strong style="color: var(--neon-cyan);">${records.totalRuns}</strong> 回</div>
      <div>全滅死亡: <strong style="color: var(--neon-red);">${stats.totalDeaths}</strong> 回</div>
      <div>撤退最深: <strong style="color: var(--neon-green);">${records.deepestRetreat ? `B${records.deepestRetreat}F` : "未記録"}</strong></div>
      <div>死亡最深: <strong style="color: var(--neon-red);">${records.deepestDeath ? `B${records.deepestDeath}F` : "未記録"}</strong></div>
      <div>累計撃破: <strong style="color: var(--neon-green);">${stats.totalKills}</strong> 匹</div>
      <div style="grid-column: span 2;">宝箱開封: <strong style="color: var(--neon-yellow);">${stats.totalChests}</strong> 個</div>
      <div style="grid-column: span 2;">クラス最深: <strong>${classRecords}</strong></div>
    </div>
  `;
  html += `</div>`;
  
  html += `</div>`;
  return html;
}

export function getRunHistoryHtml() {
  if (!state.runHistory || state.runHistory.length === 0) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">探索履歴はありません</div>`;
  }
  
  let html = `<div style="display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 11px;">`;
  state.runHistory.forEach((h, i) => {
    const dateStr = new Date(h.endedAt).toLocaleDateString("ja-JP") + " " + new Date(h.endedAt).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
    const resText = h.result === "returned" ? "成功" : "失敗";
    const resColor = h.result === "returned" ? "var(--neon-green)" : "var(--neon-red)";
    const outcomeText = getRunOutcomeLabel(h);
    const outcomeColor = getRunOutcomeColor(h);
    
    html += `
      <div style="background-color: #1a1a24; border: 1px solid #333; border-radius: 4px; padding: 6px 8px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 2px; margin-bottom: 4px;">
          <strong>#${state.runHistory.length - i} [${dateStr}] <span style="color: ${outcomeColor};">${outcomeText}</span></strong>
          <span style="color: ${resColor}; font-weight: bold;">${resText} (Rank: ${h.dangerRank})</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; color: #ddd; font-size: 10px;">
          <div>到達階: B${h.deepestFloor}F</div>
          <div>撃破数: ${h.kills} 匹</div>
          <div>宝箱開封: ${h.chestsOpened} 個</div>
          <div>持帰素材: ${Object.values(h.bankedMaterials || {}).reduce((sum, quantity) => sum + quantity, 0)} 個</div>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

export function getDeathLogsHtml() {
  if (!state.deathLogs || state.deathLogs.length === 0) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">死亡記録はありません</div>`;
  }
  
  let html = `<div style="display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 11px;">`;
  state.deathLogs.forEach((d, i) => {
    const dateStr = new Date(d.endedAt).toLocaleDateString("ja-JP") + " " + new Date(d.endedAt).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
    const lostItemsText = d.lostItems && d.lostItems.length > 0 ? d.lostItems.join(", ") : "なし";
    
    html += `
      <div style="background-color: #1a1a24; border: 1px solid #333; border-radius: 4px; padding: 6px 8px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 2px; margin-bottom: 4px; color: var(--neon-red);">
          <strong>☠️ 死亡記録 #${state.deathLogs.length - i}</strong>
          <span>B${d.floor}F (${d.x}, ${d.y})</span>
        </div>
        <div style="color: #ddd; font-size: 10px; display: flex; flex-direction: column; gap: 2px;">
          <div><strong>日時:</strong> ${dateStr}</div>
          <div><strong>死因:</strong> ${d.cause}</div>
          <div><strong>Lv:</strong> ${d.character?.level ?? "?"} | 撃破数: ${d.kills}</div>
          <div style="color: var(--neon-yellow); white-space: normal; word-break: break-all;"><strong>紛失戦利品:</strong> ${lostItemsText}</div>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

export function openArchivesOverlay() {
  archivesState.tab = "monsters";
  archivesState.selectedId = null;
  archivesState.listScrollTop = 0;
  
  const overlay = document.getElementById("archives-overlay");
  if (overlay) {
    overlay.removeAttribute("style");
    overlay.classList.remove("is-hidden");
  }
  
  renderArchives();
}

export function renderArchives() {
  const overlay = document.getElementById("archives-overlay");
  if (!overlay) return;
  
  overlay.innerHTML = "";
  
  // 1. Header
  const header = document.createElement("div");
  header.className = "archives-header";
  
  const title = document.createElement("span");
  title.className = "archives-title";
  title.textContent = "古城年代記・書庫";
  header.appendChild(title);
  
  overlay.appendChild(header);
  
  // 2. Body
  const body = document.createElement("div");
  body.className = "archives-body";
  
  if (archivesState.tab === "monsters") {
    // Monsters Codex Grid
    if (archivesState.selectedId) {
      // Show Detail View
      const monsterName = archivesState.selectedId;
      const m = MONSTERS.find(x => x.name === monsterName);
      const record = state.codex?.monsters?.[monsterName];
      
      const detailHtml = getMonsterCodexDetailHtml(m, record);
      const detailContainer = document.createElement("div");
      detailContainer.innerHTML = detailHtml;
      
      const btnBack = document.createElement("button");
      btnBack.className = "btn btn-neon btn-block";
      btnBack.textContent = "一覧に戻る";
      btnBack.addEventListener("click", () => {
        archivesState.selectedId = null;
        renderArchives();
      });
      detailContainer.appendChild(btnBack);
      body.appendChild(detailContainer);
    } else {
      // List View
      const grid = document.createElement("div");
      grid.className = "codex-grid";
      
      MONSTERS.forEach(m => {
        if (m.name === "いにしえの竜" && (!state.codex?.monsters?.["いにしえの竜"] || state.codex?.monsters?.["いにしえの竜"].encountered === 0)) {
          // Hide boss until encountered
          return;
        }
        if (m.name === "デーモンガード" && (!state.codex?.monsters?.["デーモンガード"] || state.codex?.monsters?.["デーモンガード"].encountered === 0)) {
          return;
        }
        
        const record = state.codex?.monsters?.[m.name];
        const isDiscovered = record && record.encountered > 0;
        
        const row = document.createElement("div");
        row.className = "codex-row";
        
        if (!isDiscovered) {
          row.innerHTML = `
            <span class="codex-name" style="color: var(--text-muted);">？？？</span>
            <span class="codex-meta">未遭遇</span>
          `;
        } else {
          row.innerHTML = `
            <span class="codex-name">${m.name}</span>
            <span class="codex-meta">撃破: ${record.killed}</span>
          `;
          row.addEventListener("click", () => {
            archivesState.listScrollTop = body.scrollTop;
            archivesState.selectedId = m.name;
            renderArchives();
          });
        }
        grid.appendChild(row);
      });
      body.appendChild(grid);
    }
  } else if (archivesState.tab === "equipment") {
    // Equipment Codex Grid
    if (archivesState.selectedId) {
      const baseId = archivesState.selectedId;
      const record = state.codex?.equipment?.[baseId];
      
      const detailHtml = getEquipmentCodexDetailHtml(baseId, record);
      const detailContainer = document.createElement("div");
      detailContainer.innerHTML = detailHtml;
      
      const btnBack = document.createElement("button");
      btnBack.className = "btn btn-neon btn-block";
      btnBack.textContent = "一覧に戻る";
      btnBack.addEventListener("click", () => {
        archivesState.selectedId = null;
        renderArchives();
      });
      detailContainer.appendChild(btnBack);
      body.appendChild(detailContainer);
    } else {
      // List weapons, armors, shields, accessories
      const grid = document.createElement("div");
      grid.className = "codex-grid";
      
      const equipKeys = Object.keys(ITEMS).filter(k => {
        const item = ITEMS[k];
        return item && (item.type === "weapon" || item.type === "armor" || item.type === "shield" || item.type === "accessory");
      });
      
      equipKeys.forEach(k => {
        const item = ITEMS[k];
        const record = state.codex?.equipment?.[k];
        const isDiscovered = record && record.foundCount > 0;
        
        const row = document.createElement("div");
        row.className = "codex-row";
        
        if (!isDiscovered) {
          row.innerHTML = `
            <span class="codex-name" style="color: var(--text-muted);">？？？</span>
            <span class="codex-meta">未発見</span>
          `;
        } else {
          row.innerHTML = `
            <span class="codex-name">${item.name}</span>
            <span class="codex-meta">入手: ${record.foundCount}回</span>
          `;
          row.addEventListener("click", () => {
            archivesState.listScrollTop = body.scrollTop;
            archivesState.selectedId = k;
            renderArchives();
          });
        }
        grid.appendChild(row);
      });
      body.appendChild(grid);
    }
  } else if (archivesState.tab === "events") {
    const container = document.createElement("div");
    container.innerHTML = getEventsCodexHtml();
    body.appendChild(container);
  } else if (archivesState.tab === "runHistory") {
    const container = document.createElement("div");
    container.innerHTML = getRunHistoryHtml();
    body.appendChild(container);
  } else if (archivesState.tab === "deathLogs") {
    const container = document.createElement("div");
    container.innerHTML = getDeathLogsHtml();
    body.appendChild(container);
  }

  overlay.appendChild(body);

  if (
    archivesState.selectedId === null &&
    (archivesState.tab === "monsters" || archivesState.tab === "equipment")
  ) {
    trackArchivesListScroll(body);
  }

  // 3. Bottom Actions Container
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  // Tabs Row
  const tabs = document.createElement("div");
  tabs.className = "bottom-actions-row archives-tabs";
  
  const tabList = [
    { id: "monsters", name: "👿 敵" },
    { id: "equipment", name: "🛡️ 装備" },
    { id: "events", name: "⚠️ 罠" },
    { id: "runHistory", name: "📜 記録" },
    { id: "deathLogs", name: "☠️ 死亡" }
  ];
  
  tabList.forEach(t => {
    const tabBtn = document.createElement("button");
    tabBtn.className = `archives-tab ${archivesState.tab === t.id ? "active" : ""}`;
    tabBtn.textContent = t.name;
    tabBtn.addEventListener("click", () => {
      archivesState.tab = t.id;
      archivesState.selectedId = null;
      archivesState.listScrollTop = 0;
      renderArchives();
    });
    tabs.appendChild(tabBtn);
  });
  footer.appendChild(tabs);

  // Close Row
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger";
  btnClose.textContent = "❌ 閉じる";
  btnClose.addEventListener("click", () => {
    overlay.classList.add("is-hidden");
    state.gameState = "town";
    updateUI();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
  if (
    archivesState.selectedId === null &&
    (archivesState.tab === "monsters" || archivesState.tab === "equipment")
  ) {
    body.scrollTop = archivesState.listScrollTop;
  }
}
