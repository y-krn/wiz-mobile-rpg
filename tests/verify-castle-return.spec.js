import { test, expect } from '@playwright/test';

test.describe('Castle Return and Recovery Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    
    // HP/MPが減少した状態＆探索結果画面（gameState = "result"）のモックデータを設定
    await page.evaluate(() => {
      localStorage.clear();
      
      const mockSave = {
        version: 1,
        x: 0,
        y: 0,
        dir: 0,
        prevX: 0,
        prevY: 0,
        gold: 100,
        party: [
          {
            name: "Arthur",
            class: "Mage",
            level: 1,
            exp: 0,
            hp: 5,
            maxHp: 20,
            mp: 1,
            maxMp: 5,
            str: 15,
            int: 7,
            pie: 8,
            vit: 14,
            agi: 10,
            luk: 9,
            status: "ok",
            equipment: {
              weapon: "SHORT_SWORD",
              shield: "SMALL_SHIELD",
              armor: "LEATHER_ARMOR"
            }
          }
        ],
        roster: [
          {
            name: "Arthur",
            class: "Mage",
            level: 1,
            exp: 0,
            hp: 5,
            maxHp: 20,
            mp: 1,
            maxMp: 5,
            str: 15,
            int: 7,
            pie: 8,
            vit: 14,
            agi: 10,
            luk: 9,
            status: "ok",
            equipment: {
              weapon: "SHORT_SWORD",
              shield: "SMALL_SHIELD",
              armor: "LEATHER_ARMOR"
            }
          }
        ],
        inventory: [],
        floor: 1,
        maps: [null, null, null, null, null],
        visitedMaps: [null, null, null, null, null],
        lightTurns: 0,
        lightPower: "",
        repelTurns: 0,
        dumapicTurns: 0,
        dumapicHint: "",
        eventCooldownTurns: 0,
        activeMerchantStock: [],
        floorChestsOpened: [0, 0, 0, 0, 0],
        floorChestsTotal: [0, 0, 0, 0, 0],
        firstKills: [],
        lastReturnedFloor: null,
        currentRun: {
          startedAt: Date.now(),
          startFloor: 1,
          deepestFloor: 1,
          steps: 5,
          battles: 1,
          kills: 1,
          elitesKilled: 0,
          bossesKilled: 0,
          chestsOpened: 0,
          trapsTriggered: 0,
          trapsDisarmed: 0,
          goldGained: 20,
          expGained: 10,
          itemsFound: [],
          equipmentFound: [],
          firstKills: [],
          floorsVisited: [1],
          dangerScore: 10,
          dangerRank: "D",
          dangerLabel: "小規模探索",
          returnReason: "manual"
        },
        runHistory: [],
        deathLogs: [],
        remains: [],
        codex: {
          monsters: {},
          equipment: {},
          events: {},
          stats: {
            totalRuns: 0,
            totalDeaths: 0,
            deepestFloor: 1,
            totalKills: 0,
            totalChests: 0
          }
        },
        seed: "TESTSEED",
        gameState: "result",
        combatState: null,
        chestState: null,
        roamingMonsters: [],
        roamingMovementStepCount: 0,
        firstChestUnidentifiedGuaranteed: false,
        contracts: [],
        activeContract: null,
        completedContracts: [],
        storage: [],
        storageMax: 30,
        identifyTickets: 0,
        cleared: false,
        materials: {},
        dungeonMemory: { traps: {} },
        logs: []
      };
      
      localStorage.setItem('mobile_wiz_rpg_autosave', JSON.stringify(mockSave));
    });
    
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('Verify castle return does not heal, stable heals MP, inn heals HP/MP with cost', async ({ page }) => {
    // 1. 探索結果画面から「お城へ戻る」ボタンを押す
    const btnCastle = page.locator('button#btn-result-castle');
    await expect(btnCastle).toBeVisible();
    await btnCastle.click();
    await page.waitForTimeout(500);

    // 2. 街（town）に戻った後、HP/MPが全回復していないことをHUDで確認する
    // ArthurのHPは 5, MPは 1
    const hudInfo = page.locator('.party-card').first();
    await expect(hudInfo).toContainText('Arthur');
    await expect(hudInfo.locator('.bar-container').nth(0)).toContainText('5');
    await expect(hudInfo.locator('.bar-container').nth(1)).toContainText('1');

    // 3. お城（メニュー内のお城）に遷移
    const townCastleBtn = page.locator('button#btn-town-castle');
    await expect(townCastleBtn).toBeVisible();
    await townCastleBtn.click();
    await page.waitForTimeout(500);

    // 4. 馬小屋で休むを実行 (無料 / MP全回復)
    const btnStable = page.locator('button:has-text("馬小屋で休む")');
    await expect(btnStable).toBeVisible();
    await btnStable.click();
    await page.waitForTimeout(500);

    // HP 5（変化なし）, MP 5（全回復）を確認
    await expect(hudInfo.locator('.bar-container').nth(0)).toContainText('5');
    await expect(hudInfo.locator('.bar-container').nth(1)).toContainText('5');

    // 5. 宿屋で休むを実行 (有料 / HP・MP全回復)
    // 料金はLv1のArthur1名なので 1 * 10 = 10G
    // 元の所持金 100G から 90G になるはず
    const goldText = page.locator('#gold-counter');
    await expect(goldText).toContainText('100');

    const btnInn = page.locator('button:has-text("宿屋で休む")');
    await expect(btnInn).toBeVisible();
    await btnInn.click();
    await page.waitForTimeout(500);

    // HP 20, MP 5 を確認
    await expect(hudInfo.locator('.bar-container').nth(0)).toContainText('20');
    await expect(hudInfo.locator('.bar-container').nth(1)).toContainText('5');
    
    // ゴールドが減って 90 になっていることを確認
    await expect(goldText).toContainText('90');
  });
});
