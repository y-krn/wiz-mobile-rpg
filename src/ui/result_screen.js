import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { getItemData, getItemBaseId } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";
import { openSubmenu } from "../navigation.js";

export function getEvaluationText(run, isSuccess) {
  if (!run) return "";
  if (!isSuccess) {
    return "無念…！迷宮の暗闇に呑まれ、探索は失敗した。全滅により獲得ゴールドが失われ、未鑑定装備の一部が紛失した。今回の教訓を胸に、次の冒険に備えよう。";
  }
  
  let lines = [];
  if (run.deepestFloor >= 4) {
    lines.push(`B${run.deepestFloor}Fの深部まで到達し、見事な生還を遂げた。`);
  } else {
    lines.push(`B${run.deepestFloor}Fまで到達し、無事帰還した。`);
  }
  
  if (run.chestsOpened >= 5) {
    lines.push("多くの宝箱を回収し、大きな戦利品を得た。");
  } else if (run.chestsOpened >= 2) {
    lines.push("いくつかの宝箱を回収し、まずまずの成果を収めた。");
  }
  
  if (run.trapsTriggered === 0 && run.chestsOpened > 0) {
    lines.push("罠被害は皆無であり、極めて慎重かつ優秀な探索だ。");
  } else if (run.trapsTriggered > 0) {
    lines.push("罠に被弾する場面もあったが、致命傷は避けた。");
  }
  
  if (run.kills >= 20) {
    lines.push("行く手を阻む魔物たちを数多く撃破し、その武勇を示した。");
  }

  if (lines.length === 0) {
    return "安全を最優先にし、無理のない探索を行った。";
  }
  return lines.join(" ");
}

export function renderResultScreen() {
  const overlay = document.getElementById("result-overlay");
  if (!overlay || !state.currentRun) return;

  const run = state.currentRun;
  const isSuccess = run.returnReason !== "gameover";
  const titleText = isSuccess ? "探索結果 (無事帰還)" : "探索失敗 (全滅)";
  const headerClass = isSuccess ? "success" : "failed";

  const itemsCount = run.itemsFound.length;
  const equipCount = run.equipmentFound.length;
  const unidentifiedCount = (run.equipmentFound || []).filter(eq => typeof eq === "object" && !eq.identified).length;
  const totalLootCount = itemsCount + equipCount;
  const lootTitle = isSuccess ? `持ち帰り品 (${totalLootCount}個)` : `失った発見品 (${totalLootCount}個)`;

  const getReasonJp = (r) => {
    if (r === "stairs") return "迷宮の階段からお城へ帰還";
    if (r === "escape_scroll") return "帰還のスクロールでお城へ帰還";
    if (r === "gameover") return "魔物に敗北（全滅）";
    return r || "不明";
  };

  let lootHtml = "";
  if (totalLootCount === 0) {
    lootHtml = `<div style="font-size: 10px; color: var(--text-muted); text-align: center; padding: 6px;">獲得品なし</div>`;
  } else {
    run.itemsFound.forEach(itemKey => {
      const item = getItemData(itemKey);
      lootHtml += `
        <div class="result-item-entry">
          <span>📦 ${item.name}</span>
          <span class="result-item-rarity common">コモン</span>
        </div>
      `;
    });
    run.equipmentFound.forEach(equip => {
      const item = getItemData(equip);
      const rarityLabel = (item.rarity || "common").toUpperCase();
      const rarityClass = item.rarity || "common";
      const isUnidentified = !equip.identified;
      const tagHtml = isUnidentified ? `<span class="unidentified-tag">【未鑑定】</span>` : "";
      lootHtml += `
        <div class="result-item-entry">
          <span>🛡️ ${tagHtml}${item.name}</span>
          <span class="result-item-rarity ${rarityClass}">${rarityLabel}</span>
        </div>
      `;
    });
  }

  let featuredLootHtml = "";
  const unidentifiedEquip = (run.equipmentFound || []).filter(eq => !eq.identified);
  if (unidentifiedEquip.length > 0) {
    const rarityWeight = { epic: 3, rare: 2, magic: 1 };
    const sortedLoot = [...unidentifiedEquip].sort((a, b) => {
      return (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0);
    });
    const displayedLoot = sortedLoot.slice(0, 3);
    const lootListHtml = displayedLoot.map(eq => {
      const eqData = getItemData(eq);
      const color = eq.rarity === "epic" ? "var(--neon-purple)" :
                    eq.rarity === "rare" ? "var(--neon-gold)" :
                    "var(--neon-cyan)";
      
      let hintText = "";
      if (!eq.identified && eq.affixes && eq.affixes.length > 0) {
        const hintLabels = {
          followUp: "連撃",
          arcane: "秘術",
          devotion: "神聖",
          guardian: "守護",
          treasureSense: "宝探",
          trapBonus: "技巧",
          antiUndead: "不死祓い",
          antiDragon: "竜殺し",
          spellGuard: "魔除け",
          poisonWard: "毒避け",
          firstStrike: "先制"
        };
        const hintAff = eq.affixes.find(aff => hintLabels[aff.type]);
        if (hintAff) {
          hintText = `<div style="font-size: 8px; color: var(--neon-yellow); margin-top: 1px;">気配: ${hintLabels[hintAff.type]}</div>`;
        }
      }

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: 11px;">
          <div>
            <span style="color: ${color}; font-weight: bold;">💎 ${eqData.name}</span>
            ${hintText}
          </div>
          <span style="font-size: 9px; color: var(--text-muted); font-family: var(--font-mono);">${eq.rarity.toUpperCase()}</span>
        </div>
      `;
    }).join("");
    
    featuredLootHtml = `
      <div class="result-eval-section" style="margin-top: 10px; border-color: var(--neon-cyan); padding: 8px 10px; background: rgba(0, 162, 232, 0.05); text-align: left;">
        <div class="result-eval-title" style="color: var(--neon-cyan); font-size: 11px; margin-bottom: 6px; border-bottom: 1px solid rgba(0, 162, 232, 0.2); padding-bottom: 2px;">🏆 今回の目玉戦利品</div>
        ${lootListHtml}
      </div>
    `;
  }

  let historyHtml = "";
  if (state.runHistory && state.runHistory.length > 0) {
    state.runHistory.slice(0, 5).forEach((h, i) => {
      const dateStr = new Date(h.endedAt).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
      const resText = h.result === "returned" ? "成功" : "失敗";
      const resColor = h.result === "returned" ? "var(--neon-green)" : "var(--neon-red)";
      historyHtml += `
        <div class="result-history-entry">
          <span>#${i+1} [${dateStr}] B${h.deepestFloor}F / 撃破:${h.kills} / 宝箱:${h.chestsOpened}</span>
          <span style="color: ${resColor}; font-weight: bold;">${resText} (Rank:${h.dangerRank})</span>
        </div>
      `;
    });
  } else {
    historyHtml = `<div style="font-size: 8px; color: var(--text-muted); text-align: center;">履歴はありません</div>`;
  }

  // 今回獲得した素材
  let materialsHtml = "";
  if (run.materialsFound && Object.keys(run.materialsFound).length > 0) {
    const matList = Object.entries(run.materialsFound)
      .map(([name, qty]) => `<span style="display:inline-block; margin:2px 4px; padding:2px 6px; background:#222; border:1px solid #444; border-radius:3px; font-size:10px; color:var(--neon-green)">${name} x${qty}</span>`)
      .join(" ");
    materialsHtml = `
      <div class="result-eval-section" style="margin-top: 10px; border-color: var(--neon-green); padding: 8px 10px; background: rgba(0, 255, 102, 0.05); text-align: left;">
        <div class="result-eval-title" style="color: var(--neon-green); font-size: 11px; margin-bottom: 6px; border-bottom: 1px solid rgba(0, 255, 102, 0.2); padding-bottom: 2px;">🍁 今回獲得した素材</div>
        <div style="line-height: 1.5;">${matList}</div>
      </div>
    `;
  }

  // 探索契約の判定表示HTML
  let contractHtml = "";
  if (run.contractResult) {
    const cr = run.contractResult;
    const resClass = cr.success ? "success" : "failed";
    const resTitle = cr.success ? "🎉 探索契約 達成！" : "❌ 探索契約 未達成";
    const statusColor = cr.success ? "var(--neon-green)" : "var(--neon-red)";
    
    let rewardText;
    if (cr.success) {
      const tickets = cr.contract.reward.identifyTickets > 0 ? ` / 鑑定割引券: ${cr.contract.reward.identifyTickets}枚` : "";
      rewardText = `獲得：${cr.contract.reward.gold} G${tickets}`;
      if (cr.itemMsg) {
        rewardText += `<br><span style="font-size: 10px; color: var(--neon-cyan);">${cr.itemMsg}</span>`;
      }
    } else {
      rewardText = cr.reason || "目標を達成できませんでした。";
    }

    contractHtml = `
      <div class="result-eval-section ${resClass}" style="margin-top: 10px; border-color: ${statusColor};">
        <div class="result-eval-title" style="color: ${statusColor};">${resTitle}</div>
        <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">契約: ${cr.contract.name}</div>
        <div style="font-size: 10px; color: var(--text-muted);">${cr.contract.description}</div>
        <div style="font-size: 11px; margin-top: 6px; border-top: 1px dashed #333; padding-top: 4px;">
          ${rewardText}
        </div>
      </div>
    `;
  }

  if (!isSuccess) {
    // 全滅専用のレイアウトを表示
    overlay.innerHTML = `
      <div class="result-header failed">
        <div class="result-title">${titleText}</div>
        <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">発生原因: ${getReasonJp(run.returnReason)}</div>
      </div>
      <div class="result-body">
        <div class="result-summary-section" style="border-color: var(--neon-red); background: rgba(255, 0, 51, 0.05); margin-bottom: 12px;">
          <div class="result-summary-item">
            <span class="result-summary-label">全滅階層</span>
            <span class="result-summary-val" style="color: var(--neon-red);">B${run.deepestFloor}F</span>
          </div>
          <div class="result-summary-item">
            <span class="result-summary-label">救出費損失</span>
            <span class="result-summary-val" style="color: var(--neon-red);">${run.lostGold || 0} G</span>
          </div>
          <div class="result-summary-item">
            <span class="result-summary-label">遺留品アイテム</span>
            <span class="result-summary-val" style="color: var(--neon-cyan);">${run.remainsItemCount || 0} 個</span>
          </div>
        </div>

        <div class="result-eval-section failed" style="border-color: var(--neon-red); margin-bottom: 12px; text-align: left;">
          <div class="result-eval-title" style="color: var(--neon-red);">💀 損失の報告</div>
          <div style="font-size: 11px; line-height: 1.6;">
            ・パーティメンバー全員が<strong>死亡状態</strong>になりました。<br>
            ・所持金から救出費として <strong>${run.lostGold || 0} G</strong> を失いました。<br>
            ・今回の遠征で獲得した未確定の戦利品 <strong>${totalLootCount} 個</strong> が消滅しました。<br>
            ・出発前から所持していたアイテムのうち <strong>${run.remainsItemCount || 0} 個</strong> が遺留品として <strong>B${run.wipedFloor || run.deepestFloor}F (X:${run.wipedX || 0} Y:${run.wipedY || 0})</strong> に残されました。
          </div>
        </div>

        <div class="result-eval-section" style="border-color: var(--neon-gold); background: rgba(255, 170, 0, 0.05); text-align: left; margin-bottom: 12px;">
          <div class="result-eval-title" style="color: var(--neon-gold);">💡 次の推奨アクション</div>
          <div style="font-size: 11px; line-height: 1.5;">
            1. <strong>カント寺院</strong>で死亡したメンバーの蘇生を試みます（灰化・ロストのリスクあり）。<br>
            2. 不足メンバーを<strong>訓練場</strong>で新しく編成します。<br>
            3. 態勢を整え、全滅地点へ<strong>遺留品の回収</strong>に向かいます。
          </div>
        </div>

        <div class="result-history-section">
          <div class="result-section-title" style="font-size: 10px; color: var(--neon-cyan); text-shadow: var(--neon-glow-cyan);">📜 最近の探索履歴</div>
          <div class="result-history-list">
            ${historyHtml}
          </div>
        </div>
      </div>
      <div class="result-footer-actions" style="display: flex; flex-direction: column; gap: 8px; padding-bottom: 20px;">
        <button id="btn-result-temple" class="btn btn-neon btn-block" style="border-color: var(--neon-red); color: var(--neon-red); height: 44px;">⛪ 寺院で蘇生する</button>
        <button id="btn-result-training" class="btn btn-neon btn-block" style="border-color: var(--neon-green); color: var(--neon-green); height: 44px;">👥 訓練場で編成する</button>
        <button id="btn-result-remains" class="btn btn-neon btn-block" style="border-color: var(--neon-cyan); color: var(--neon-cyan); height: 44px;">📦 遺留品を確認する</button>
        <button id="btn-result-close" class="btn btn-secondary btn-block" style="height: 44px;">❌ 街に戻る</button>
      </div>
    `;

    document.getElementById("btn-result-temple").addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      state.currentRun = null;
      updateUI();
      openSubmenu("temple_main", "カント寺院 - 蘇生と治療：");
    });

    document.getElementById("btn-result-training").addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      state.currentRun = null;
      updateUI();
      openSubmenu("party_assemble", "訓練場 - パーティ編成:");
    });

    document.getElementById("btn-result-remains").addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      state.currentRun = null;
      updateUI();
      openSubmenu("castle_remains_list", "おしろ - 遺留品情報：");
    });

    document.getElementById("btn-result-close").addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      state.currentRun = null;
      updateUI();
    });
  } else {
    // 成功（無事帰還）時の従来の表示
    overlay.innerHTML = `
      <div class="result-header ${headerClass}">
        <div class="result-title">${titleText}</div>
        <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">帰還理由: ${getReasonJp(run.returnReason)}</div>
      </div>
      <div class="result-body">
        <div class="result-summary-section">
          <div class="result-summary-item">
            <span class="result-summary-label">到達階層</span>
            <span class="result-summary-val" style="color: var(--neon-cyan);">B${run.deepestFloor}F</span>
          </div>
          <div class="result-danger-rank-container">
            <span class="result-summary-label">危険度評価</span>
            <span class="result-danger-rank-val rank-${run.dangerRank.toLowerCase()}">${run.dangerRank}</span>
            <span class="result-danger-label rank-${run.dangerRank.toLowerCase()}">${run.dangerLabel}</span>
          </div>
          <div class="result-summary-item">
            <span class="result-summary-label">未鑑定装備</span>
            <span class="result-summary-val" style="color: var(--neon-gold);">${unidentifiedCount} 個</span>
          </div>
        </div>

        <div class="result-details-section">
          <div class="result-detail-row">
            <span>戦利品 / GOLD:</span>
            <span class="result-detail-val">${totalLootCount} 個 / ${run.goldGained} G</span>
          </div>
          <div class="result-detail-row">
            <span>戦闘回数 / 総撃破数:</span>
            <span class="result-detail-val">${run.battles} 回 / ${run.kills} 匹</span>
          </div>
          <div class="result-detail-row">
            <span>宝箱開封 / 罠解除:</span>
            <span class="result-detail-val">${run.chestsOpened} 個 / ${run.trapsDisarmed} 回</span>
          </div>
          <div class="result-detail-row">
            <span>罠被弾数:</span>
            <span class="result-detail-val" style="color: ${run.trapsTriggered > 0 ? "var(--neon-red)" : "inherit"};">${run.trapsTriggered} 回</span>
          </div>
          <div class="result-detail-row">
            <span>装備候補 / 未鑑定:</span>
            <span class="result-detail-val" style="color: var(--neon-cyan);">${equipCount} 個 / ${unidentifiedCount} 個</span>
          </div>
        </div>

        <div class="result-eval-section ${headerClass}">
          <div class="result-eval-title">今回の冒険評価</div>
          <div>${getEvaluationText(run, isSuccess)}</div>
        </div>

        ${materialsHtml}
        ${contractHtml}
        ${featuredLootHtml}

        <div class="result-items-section">
          <div class="result-section-title">📦 ${lootTitle}</div>
          <div class="result-items-list">
            ${lootHtml}
          </div>
        </div>

        <div class="result-history-section">
          <div class="result-section-title" style="font-size: 10px; color: var(--neon-cyan); text-shadow: var(--neon-glow-cyan);">📜 最近の探索履歴</div>
          <div class="result-history-list">
            ${historyHtml}
          </div>
        </div>
      </div>
      <div class="result-footer-actions">
        <button id="btn-result-castle" class="btn btn-neon btn-block" style="height: 44px;">お城へ戻る</button>
      </div>
    `;

    const btnCastle = document.getElementById("btn-result-castle");
    if (btnCastle) {
      btnCastle.addEventListener("click", () => {
        overlay.style.display = "none";
        state.gameState = "town";
        state.currentRun = null;
        state.party.forEach(char => {
          if (char.status !== "dead") {
            char.hp = char.maxHp;
            char.mp = char.maxMp;
          }
        });
        addLog("おしろ：パーティは休息した。HPとMPが全回復した！（ステータス異常は教会で治療してください）");

        const hasCrystal = state.inventory.some(item => getItemBaseId(item) === "ANTIGRAVITY_CRYSTAL");
        if (hasCrystal) {
          playSound("level_up");
          state.cleared = true;
          state.inventory = state.inventory.filter(item => getItemBaseId(item) !== "ANTIGRAVITY_CRYSTAL");
          addLog("**************************************************");
          addLog("おめでとうございます！浮遊石を持ち帰りました！");
          addLog("王より名誉勲章が授与され、初踏破が記録されました！");
          addLog("ゲームをクリアしました！おめでとうございます！");
          addLog("**************************************************");
          saveGame();
          saveAutosave();
        } else {
          playSound("heal");
          saveGame();
          saveAutosave();
        }
        updateUI();
      });
    }
  }
}

