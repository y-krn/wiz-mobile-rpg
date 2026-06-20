# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-ux.spec.js >> UIUX Mobile One-Handed Operation tests on Galaxy S20 (360x800) >> Check all visible buttons are at least 44px high and key actions are at the bottom
- Location: tests/ui-ux.spec.js:22:5

# Error details

```
Error: Key action button "すべて" (id: ) on Equip Screen should be located in the bottom part of the screen (y: 121px, threshold: 400px)

expect(received).toBeGreaterThan(expected)

Expected: > 400
Received:   121
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]: TOWN OF LLYLGAMYN
    - generic [ref=e5]: "GOLD: 150"
    - button "🎵 ON" [ref=e6] [cursor=pointer]
  - generic [ref=e8]:
    - generic [ref=e9]: "🎯 目標: B1F: 地下2階への下り階段を探せ"
    - generic [ref=e10]:
      - generic [ref=e11]: "🗺️ 探索率: 0%"
      - generic [ref=e12]: "📦 宝箱: 0/6"
  - generic [ref=e15]:
    - generic [ref=e16]:
      - generic [ref=e17]: 道具・装備
      - generic [ref=e18]: "バッグ: 2/20個"
    - generic [ref=e20]: Arthur (戦士 Lv.1) HP:20/20 MP:0/0
    - generic [ref=e21]:
      - generic [ref=e22]:
        - generic [ref=e23]:
          - button "すべて" [ref=e24] [cursor=pointer]
          - button "道具" [ref=e25] [cursor=pointer]
          - button "武器" [ref=e26] [cursor=pointer]
          - button "防具" [ref=e27] [cursor=pointer]
        - generic [ref=e28]:
          - generic [ref=e29]: 道具
          - button "傷薬 (ディオス薬)" [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: 傷薬 (ディオス薬)
          - button "傷薬 (ディオス薬)" [ref=e32] [cursor=pointer]:
            - generic [ref=e33]: 傷薬 (ディオス薬)
      - generic [ref=e35]:
        - text: バッグまたは装備スロットを
        - text: 選択してください。
    - generic [ref=e36]:
      - generic [ref=e37]:
        - button "武器 ショートソード" [ref=e38]:
          - generic [ref=e39]: 武器
          - generic [ref=e40]: ショートソード
        - button "盾 スモールシールド" [ref=e41]:
          - generic [ref=e42]: 盾
          - generic [ref=e43]: スモールシールド
        - button "鎧 レザーアーマー" [ref=e44]:
          - generic [ref=e45]: 鎧
          - generic [ref=e46]: レザーアーマー
      - generic [ref=e47]:
        - button "◀ 前のキャラ" [ref=e48] [cursor=pointer]
        - button "次のキャラ ▶" [ref=e49] [cursor=pointer]
      - button "❌ 閉じる" [ref=e51] [cursor=pointer]
  - generic [ref=e54]: リルガミンの街へようこそ。準備を整えて迷宮に入りましょう！
  - contentinfo [ref=e56]:
    - generic [ref=e58]:
      - generic [ref=e59]:
        - generic [ref=e60]: Arthur [前]
        - generic [ref=e61]: F.1
      - generic [ref=e63]:
        - generic [ref=e64]: H
        - generic [ref=e67]: "20"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const VIEWPORTS = [
  4   |   { width: 390, height: 844, name: 'iPhone 13' },
  5   |   { width: 360, height: 800, name: 'Galaxy S20' },
  6   |   { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
  7   | ];
  8   | 
  9   | for (const vp of VIEWPORTS) {
  10  |   test.describe(`UIUX Mobile One-Handed Operation tests on ${vp.name} (${vp.width}x${vp.height})`, () => {
  11  |     test.beforeEach(async ({ page }) => {
  12  |       await page.setViewportSize({ width: vp.width, height: vp.height });
  13  |       await page.goto('/');
  14  |       await page.evaluate(() => {
  15  |         localStorage.clear();
  16  |       });
  17  |       await page.goto('/');
  18  |       await page.waitForTimeout(1000);
  19  |       await page.screenshot({ path: `./scratch/${vp.name}-start.png` });
  20  |     });
  21  | 
  22  |     test('Check all visible buttons are at least 44px high and key actions are at the bottom', async ({ page }) => {
  23  |       // Wait for initial load
  24  |       await page.waitForTimeout(1000);
  25  | 
  26  |       const verifyScreenButtons = async (screenName) => {
  27  |         await page.screenshot({ path: `./scratch/screen-${screenName.replace(/\s+/g, '_')}-${vp.name}.png` });
  28  |         const buttons = await page.locator('button:visible, [role="button"]:visible, .btn:visible, .shop-item-row:visible, .equip-item-row:visible, .char-row:visible, .archives-tab:visible').all();
  29  |         console.log(`Checking ${buttons.length} buttons on screen: ${screenName}`);
  30  |         for (const btn of buttons) {
  31  |           const text = (await btn.textContent()).trim();
  32  |           const id = await btn.getAttribute('id') || '';
  33  |           const className = await btn.getAttribute('class') || '';
  34  |           console.log(`  - Button: "${text}" (id: "${id}", class: "${className}")`);
  35  |         }
  36  |         
  37  |         for (const btn of buttons) {
  38  |           const box = await btn.boundingBox();
  39  |           if (!box) continue;
  40  |           
  41  |           const text = (await btn.textContent()).trim();
  42  |           const id = await btn.getAttribute('id') || '';
  43  |           const className = await btn.getAttribute('class') || '';
  44  | 
  45  |           // Check minimum height (ignore helper icons or very specific small tags if any, but regular buttons must be >= 44px)
  46  |           expect(box.height, `Button "${text}" (id: ${id}, class: ${className}) on ${screenName} should be >= 44px high. Found: ${box.height}px`).toBeGreaterThanOrEqual(44);
  47  | 
  48  |           // Verify if key action button is located in the bottom reach zone
  49  |           const isKeyAction = text.includes('戻る') || text.includes('閉じる') || text.includes('確定') || text.includes('決定') || text.includes('購入') || text.includes('売却') || text.includes('鑑定') || text.includes('唱える') || text.includes('加える') || text.includes('外す') || id.includes('btn-submenu-back') || className.includes('tab') || className.includes('filter');
  50  |           if (isKeyAction) {
  51  |             const centerY = box.y + box.height / 2;
  52  |             const threshold = vp.height * 0.50; // In bottom 50% of the screen
  53  |             if (!id.includes('btn-mute')) {
> 54  |               expect(centerY, `Key action button "${text}" (id: ${id}) on ${screenName} should be located in the bottom part of the screen (y: ${centerY}px, threshold: ${threshold}px)`).toBeGreaterThan(threshold);
      |                                                                                                                                                                                           ^ Error: Key action button "すべて" (id: ) on Equip Screen should be located in the bottom part of the screen (y: 121px, threshold: 400px)
  55  |             }
  56  |           }
  57  |         }
  58  |       };
  59  | 
  60  |       // 1. Town Screen
  61  |       await verifyScreenButtons('Town Screen');
  62  | 
  63  |       // 2. Training Screen
  64  |       const trainingBtn = page.locator('#btn-town-training');
  65  |       if (await trainingBtn.isVisible()) {
  66  |         await trainingBtn.click();
  67  |         await page.waitForTimeout(500);
  68  | 
  69  |         // Debug helper: select character and add to party so camp/equip screen can be opened
  70  |         const charRow = page.locator('.char-row').first();
  71  |         if (await charRow.isVisible()) {
  72  |           await charRow.click();
  73  |           await page.waitForTimeout(200);
  74  |           const addBtn = page.locator('button:has-text("加える"):visible').first();
  75  |           if (await addBtn.isVisible()) {
  76  |             await addBtn.click();
  77  |             await page.waitForTimeout(200);
  78  |           }
  79  |         }
  80  | 
  81  |         await verifyScreenButtons('Training Screen');
  82  |         // Back
  83  |         const backBtn = page.locator('#btn-submenu-back:visible, .btn-camp-close:visible, button:has-text("戻る"):visible, button:has-text("閉じる"):visible').first();
  84  |         await backBtn.click();
  85  |         await page.waitForTimeout(500);
  86  |       }
  87  | 
  88  |       // 3. Shop Screen
  89  |       const shopBtn = page.locator('#btn-town-shop');
  90  |       if (await shopBtn.isVisible()) {
  91  |         await shopBtn.click();
  92  |         await page.waitForTimeout(500);
  93  |         await verifyScreenButtons('Shop Screen');
  94  |         const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
  95  |         await backBtn.click();
  96  |         await page.waitForTimeout(500);
  97  |       }
  98  | 
  99  |       // 4. Equip Screen
  100 |       const equipBtn = page.locator('#btn-town-camp');
  101 |       if (await equipBtn.isVisible()) {
  102 |         await equipBtn.click();
  103 |         await page.waitForTimeout(500);
  104 |         await verifyScreenButtons('Equip Screen');
  105 |         const backBtn = page.locator('button:has-text("戻る"):visible, button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
  106 |         await backBtn.click();
  107 |         await page.waitForTimeout(500);
  108 |       }
  109 | 
  110 |       // 5. Archives Screen
  111 |       const archivesBtn = page.locator('#btn-town-archives');
  112 |       if (await archivesBtn.isVisible()) {
  113 |         await archivesBtn.click();
  114 |         await page.waitForTimeout(500);
  115 |         await verifyScreenButtons('Archives Screen');
  116 |         const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
  117 |         await backBtn.click();
  118 |         await page.waitForTimeout(500);
  119 |       }
  120 |     });
  121 |   });
  122 | }
  123 | 
```