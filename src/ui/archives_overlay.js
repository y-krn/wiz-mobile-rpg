import { state, createDefaultCodex } from "../state.js";
import { MONSTERS, ITEMS } from "../data.js";
import { getMonsterContractInfo } from "../contracts.js";
import { updateUI } from "./ui_root.js";
import { FLOOR_THEMES, getFloorDisplayName } from "../data/floor_themes.js";

export const archivesState = {
  tab: "monsters",
  selectedId: null,
  listScrollTop: 0
};

export function getMonsterCodexDetailHtml(m, record) {
  const enc = record ? record.encountered : 0;
  const kil = record ? record.killed : 0;
  
  if (enc === 0) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">遭遇したことがありません</div>`;
  }
  
  let html = `<div class="codex-detail">`;
  html += `
    <div class="codex-detail-header">
      <span class="codex-detail-name">${m.name}</span>
      <span class="codex-meta">遭遇: ${enc} / 撃破: ${kil}</span>
    </div>
    <div class="codex-detail-body">
      <p><strong>主な出現階層:</strong> B${m.level}F 階付近</p>
  `;
  
  if (kil >= 1) {
    html += `
      <p><strong>特徴:</strong> ${m.isPoisonous ? "毒攻撃を放つ" : m.isRare ? (m.name === "メタルパピー" ? "希少な魔物" : "非常に強力な強敵") : "標準的なモンスター"}</p>
      <p><strong>戦利品傾向:</strong> ${m.isRare ? "未鑑定装備の期待値が高い" : "通常戦利品とGOLD"} / ${m.gold} GOLD</p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[撃破すると特徴と報酬が解放されます]</p>`;
  }

  // 撃破数に応じた契約連動の推奨情報表示
  const contractInfo = getMonsterContractInfo(m.name, kil);
  html += `
    <div style="border-top: 1px solid #333; border-bottom: 1px solid #333; margin: 8px 0; padding: 6px 0;">
      <p><strong>特性:</strong> ${contractInfo.features}</p>
      <p style="color: var(--neon-green);"><strong>推奨:</strong> ${contractInfo.recommended}</p>
    </div>
  `;
  
  if (kil >= 3) {
    html += `
      <p><strong>能力値:</strong> HP: ${m.hp} | 攻撃力: ${m.atk} | 防御力: ${m.def}</p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[3回撃破すると能力値が解放されます]</p>`;
  }
  
  if (kil >= 5) {
    const resistJp = m.resistances && m.resistances.length > 0 ? m.resistances.join(", ") : "特になし";
    const spellList = m.spells || (m.spell ? [m.spell] : []);
    const spellsJp = spellList.length > 0 ? spellList.join(", ") : "唱えられない";
    html += `
      <p><strong>耐性・弱点:</strong> ${resistJp}</p>
      <p><strong>使用呪文:</strong> ${spellsJp}</p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[5回撃破すると耐性と呪文が解放されます]</p>`;
  }
  
  if (kil >= 10) {
    let note;
    if (m.name.includes("ワーウルフ")) {
      note = "毒攻撃の被弾率が高いため、毒避けを持つ前衛を編成するか解毒薬（アンチドート・ラツモフィス）を多めに準備せよ。";
    } else if (m.name.includes("デーモンガード")) {
      note = "非常に堅い鎧をまとっている。打撃武器より、侍のカタナや魔術師の強力な攻撃呪文（ラハリト、マハリト）で一掃せよ。";
    } else if (m.name.includes("いにしえの竜")) {
      note = "全階層中最強のブレス攻撃を放つ。竜殺し・魔除け・守護を重ね、回復役のMP補強装備を切らさずに戦え。";
    } else {
      note = `B${m.level}Fに広く出現する魔物。十分な装備の補正値があれば安全に討伐可能。`;
    }
    
    html += `
      <p style="border-top: 1px dashed #333; margin-top: 6px; padding-top: 6px; color: var(--neon-yellow);">
        <strong>攻略メモ:</strong> ${note}
      </p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[10回撃破すると攻略メモが解放されます]</p>`;
  }
  
  html += `</div></div>`;
  return html;
}

export function getEquipmentCodexDetailHtml(itemKey, record) {
  const item = ITEMS[itemKey];
  if (!record) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">入手したことがありません</div>`;
  }
  
  let html = `<div class="codex-detail">`;
  html += `
    <div class="codex-detail-header">
      <span class="codex-detail-name">${item.name}</span>
      <span class="codex-meta">入手回数: ${record.foundCount} 回</span>
    </div>
    <div class="codex-detail-body">
      <p><strong>種別:</strong> ${item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : item.type === "accessory" ? "装飾" : "防具"}</p>
      <p><strong>最高レアリティ:</strong> <span class="${record.highestRarity}">${record.highestRarity.toUpperCase()}</span></p>
      <p><strong>最高補正値:</strong> +${record.bestBonus}</p>
      <p><strong>発見済み特性 (Affixes):</strong> ${record.affixesSeen.length > 0 ? record.affixesSeen.map(a => {
        if (a === "atk") return "攻撃力+";
        if (a === "def") return "防御力+";
        if (a === "agi") return "素早さ+";
        if (a === "trapBonus") return "罠解除+";
        return a;
      }).join(", ") : "なし"}</p>
      <p><strong>初発見階層:</strong> ${record.firstFoundAt || "不明"}</p>
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
  html += `<div><div class="archives-section-title">📊 累計スタッツ</div>`;
  html += `
    <div style="background-color: #14141a; border: 1px solid var(--neon-cyan); border-radius: 4px; padding: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      <div>探索回数: <strong style="color: var(--neon-cyan);">${stats.totalRuns}</strong> 回</div>
      <div>全滅死亡: <strong style="color: var(--neon-red);">${stats.totalDeaths}</strong> 回</div>
      <div>最深到達: <strong style="color: var(--neon-cyan);">B${stats.deepestFloor}F</strong></div>
      <div>累計撃破: <strong style="color: var(--neon-green);">${stats.totalKills}</strong> 匹</div>
      <div style="grid-column: span 2;">宝箱開封: <strong style="color: var(--neon-yellow);">${stats.totalChests}</strong> 個</div>
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
    
    html += `
      <div style="background-color: #1a1a24; border: 1px solid #333; border-radius: 4px; padding: 6px 8px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 2px; margin-bottom: 4px;">
          <strong>#${state.runHistory.length - i} [${dateStr}]</strong>
          <span style="color: ${resColor}; font-weight: bold;">${resText} (Rank: ${h.dangerRank})</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; color: #ddd; font-size: 10px;">
          <div>到達階: B${h.deepestFloor}F</div>
          <div>撃破数: ${h.kills} 匹</div>
          <div>宝箱開封: ${h.chestsOpened} 個</div>
          <div>獲得金: ${h.goldGained} G</div>
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
          <div><strong>平均Lv:</strong> ${d.partyLevelAvg} | 撃破数: ${d.kills}</div>
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
    overlay.style.display = "flex";
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
      btnBack.style.marginTop = "8px";
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
      btnBack.style.marginTop = "8px";
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
  btnClose.className = "btn btn-danger btn-overlay-close";
  btnClose.textContent = "❌ 閉じる";
  btnClose.style.width = "100%";
  btnClose.style.minHeight = "44px";
  btnClose.addEventListener("click", () => {
    overlay.style.display = "none";
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
