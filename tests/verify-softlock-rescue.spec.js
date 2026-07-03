import { test, expect } from '@playwright/test';

test.describe('Softlock Rescue Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    
    // 全滅＋ゴールド0のモックデータを設定
    await page.evaluate(() => {
      localStorage.clear();
      
      const mockSave = {
        version: 1,
        x: 0,
        y: 0,
        dir: 0,
        prevX: 0,
        prevY: 0,
        gold: 0,
        party: [],
        roster: [
          {
            name: "Arthur",
            class: "Fighter",
            level: 1,
            exp: 0,
            hp: 0,
            maxHp: 20,
            mp: 0,
            maxMp: 0,
            str: 15,
            int: 7,
            pie: 8,
            vit: 14,
            agi: 10,
            luk: 9,
            status: "dead",
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
        currentRun: null,
        runHistory: [],
        deathLogs: [],
        remains: [],
        codex: {
          monsters: {},
          equipment: {},
          events: {
            traps: {
              "poison needle": { triggered: 0, disarmed: 0, firstFloor: 0 },
              "gas bomb": { triggered: 0, disarmed: 0, firstFloor: 0 },
              "teleporter": { triggered: 0, disarmed: 0, firstFloor: 0 },
              "flash bomb": { triggered: 0, disarmed: 0, firstFloor: 0 }
            },
            facilities: {
              spring: { found: 0, used: 0 },
              merchant: { found: 0, purchased: 0 },
              tablet: { found: 0, read: 0 },
              chest: { found: 0, opened: 0 }
            }
          },
          stats: {
            totalRuns: 0,
            totalDeaths: 0,
            deepestFloor: 1,
            totalKills: 0,
            totalChests: 0
          }
        },
        seed: "TESTSEED",
        gameState: "town",
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

  test('Verify Temple and Training Softlock Rescue Flow', async ({ page }) => {
    // 1. カント寺院に遷移して警告メッセージを確認
    const templeBtn = page.locator('button:has-text("カント寺院")');
    await expect(templeBtn).toBeVisible();
    await templeBtn.click();
    await page.waitForTimeout(500);

    const warningMsg = page.locator('text=蘇生・治療に必要な金貨が足りません。訓練場で新人を迎えて編成を立て直してください。');
    await expect(warningMsg).toBeVisible();

    const trainingBtn = page.locator('button:has-text("訓練場で編成する")');
    await expect(trainingBtn).toBeVisible();
    await trainingBtn.click();
    await page.waitForTimeout(500);

    // 2. 訓練場で「新人を迎える」ボタンが表示されていることを確認
    const rescueBtn = page.locator('button:has-text("新人を迎える")');
    await expect(rescueBtn).toBeVisible();
    
    await rescueBtn.click();
    await page.waitForTimeout(500);

    const newbieRow = page.locator('button:has-text("Trainee")');
    await expect(newbieRow).toBeVisible();

    const partySlot = page.locator('.training-party-slot.filled:has-text("Trainee")');
    await expect(partySlot).toBeVisible();

    // 3. 死亡している「Arthur」を選択し「諦める」ボタンが機能することを確認
    const arthurRow = page.locator('button:has-text("Arthur")');
    await expect(arthurRow).toBeVisible();
    await arthurRow.click();
    await page.waitForTimeout(500);

    const dismissBtn = page.locator('button:has-text("Arthurを諦める")');
    await expect(dismissBtn).toBeVisible();

    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Arthurを諦めて名簿から完全に削除しますか？');
      await dialog.accept();
    });

    await dismissBtn.click();
    await page.waitForTimeout(500);

    await expect(arthurRow).not.toBeVisible();
  });
});
