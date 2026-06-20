# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-ux.spec.js >> UIUX Mobile One-Handed Operation tests on iPhone 13 (390x844) >> Check all visible buttons are at least 44px high and key actions are at the bottom
- Location: tests/ui-ux.spec.js:22:5

# Error details

```
Error: Button "すべて" (id: , class: filter-chip active) on Shop Screen should be >= 44px high. Found: 36px

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 44
Received:    36
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
    - generic [ref=e17]: ボルタック商店
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]:
          - button "すべて" [pressed] [ref=e21] [cursor=pointer]
          - button "道具" [ref=e22] [cursor=pointer]
          - button "武器" [ref=e23] [cursor=pointer]
          - button "防具" [ref=e24] [cursor=pointer]
        - generic [ref=e25]:
          - generic [ref=e26]: 道具
          - button "傷薬 (ディオス薬) 所持:2 60G" [ref=e27] [cursor=pointer]:
            - generic [ref=e28]:
              - text: 傷薬 (ディオス薬)
              - generic [ref=e29]: 所持:2
            - generic [ref=e30]: 60G
          - button "解毒薬 (Antidote) 80G" [ref=e31] [cursor=pointer]:
            - generic [ref=e32]: 解毒薬 (Antidote)
            - generic [ref=e33]: 80G
          - button "祝福の聖水 100G" [ref=e34] [cursor=pointer]:
            - generic [ref=e35]: 祝福の聖水
            - generic [ref=e36]: 100G
          - button "魔力草 金不足 200G" [ref=e37] [cursor=pointer]:
            - generic [ref=e38]: 魔力草
            - generic [ref=e39]: 金不足
            - generic [ref=e40]: 200G
          - button "帰還のスクロール 100G" [ref=e41] [cursor=pointer]:
            - generic [ref=e42]: 帰還のスクロール
            - generic [ref=e43]: 100G
          - generic [ref=e44]: 武器
          - button "ダガー 50G" [ref=e45] [cursor=pointer]:
            - generic [ref=e46]: ダガー
            - generic [ref=e47]: 50G
          - button "魔術師の杖 120G" [ref=e48] [cursor=pointer]:
            - generic [ref=e49]: 魔術師の杖
            - generic [ref=e50]: 120G
          - button "ショートソード 所持:1 150G" [ref=e51] [cursor=pointer]:
            - generic [ref=e52]:
              - text: ショートソード
              - generic [ref=e53]: 所持:1
            - generic [ref=e54]: 150G
          - button "メイス 100G" [ref=e55] [cursor=pointer]:
            - generic [ref=e56]: メイス
            - generic [ref=e57]: 100G
          - button "忍びの短刀 金不足 300G" [ref=e58] [cursor=pointer]:
            - generic [ref=e59]: 忍びの短刀
            - generic [ref=e60]: 金不足
            - generic [ref=e61]: 300G
          - button "ロングソード 金不足 400G" [ref=e62] [cursor=pointer]:
            - generic [ref=e63]: ロングソード
            - generic [ref=e64]: 金不足
            - generic [ref=e65]: 400G
          - button "クレイモア 金不足 750G" [ref=e66] [cursor=pointer]:
            - generic [ref=e67]: クレイモア
            - generic [ref=e68]: 金不足
            - generic [ref=e69]: 750G
          - button "名刀ムラマサ 金不足 1500G" [ref=e70] [cursor=pointer]:
            - generic [ref=e71]: 名刀ムラマサ
            - generic [ref=e72]: 金不足
            - generic [ref=e73]: 1500G
          - generic [ref=e74]: 防具
          - button "スモールシールド 所持:1 80G" [ref=e75] [cursor=pointer]:
            - generic [ref=e76]:
              - text: スモールシールド
              - generic [ref=e77]: 所持:1
            - generic [ref=e78]: 80G
          - button "ラージシールド 金不足 250G" [ref=e79] [cursor=pointer]:
            - generic [ref=e80]: ラージシールド
            - generic [ref=e81]: 金不足
            - generic [ref=e82]: 250G
          - button "ナイトシールド 金不足 450G" [ref=e83] [cursor=pointer]:
            - generic [ref=e84]: ナイトシールド
            - generic [ref=e85]: 金不足
            - generic [ref=e86]: 450G
          - button "魔法使いのローブ 30G" [ref=e87] [cursor=pointer]:
            - generic [ref=e88]: 魔法使いのローブ
            - generic [ref=e89]: 30G
          - button "魔術師のクローク 金不足 380G" [ref=e90] [cursor=pointer]:
            - generic [ref=e91]: 魔術師のクローク
            - generic [ref=e92]: 金不足
            - generic [ref=e93]: 380G
          - button "レザーアーマー 所持:1 120G" [ref=e94] [cursor=pointer]:
            - generic [ref=e95]:
              - text: レザーアーマー
              - generic [ref=e96]: 所持:1
            - generic [ref=e97]: 120G
          - button "忍者の装束 金不足 250G" [ref=e98] [cursor=pointer]:
            - generic [ref=e99]: 忍者の装束
            - generic [ref=e100]: 金不足
            - generic [ref=e101]: 250G
          - button "スケイルメイル 金不足 220G" [ref=e102] [cursor=pointer]:
            - generic [ref=e103]: スケイルメイル
            - generic [ref=e104]: 金不足
            - generic [ref=e105]: 220G
          - button "チェインメイル 金不足 350G" [ref=e106] [cursor=pointer]:
            - generic [ref=e107]: チェインメイル
            - generic [ref=e108]: 金不足
            - generic [ref=e109]: 350G
          - button "司祭の法衣 金不足 500G" [ref=e110] [cursor=pointer]:
            - generic [ref=e111]: 司祭の法衣
            - generic [ref=e112]: 金不足
            - generic [ref=e113]: 500G
          - button "プレートメイル 金不足 900G" [ref=e114] [cursor=pointer]:
            - generic [ref=e115]: プレートメイル
            - generic [ref=e116]: 金不足
            - generic [ref=e117]: 900G
      - generic [ref=e119]:
        - text: 取引するアイテムを
        - text: 選択してください
    - generic [ref=e120]:
      - generic [ref=e121]:
        - generic [ref=e122]: 💰 150G
        - generic [ref=e123]: "🎒 バッグ: 2/20"
      - generic [ref=e124]:
        - button "🛡️ 買う" [pressed] [ref=e125] [cursor=pointer]
        - button "💰 売る" [ref=e126] [cursor=pointer]
        - button "🔍 鑑定" [ref=e127] [cursor=pointer]
      - generic [ref=e128]:
        - button "取引するアイテムを選択してください" [disabled]
      - button "❌ 閉じる" [ref=e130] [cursor=pointer]
  - generic [ref=e133]: リルガミンの街へようこそ。準備を整えて迷宮に入りましょう！
  - generic [ref=e135]:
    - generic [ref=e136]: ボルタック商店 - アイテムの売買：
    - generic [ref=e138]: ボルタック商店で取引中...
    - button "戻る" [ref=e139] [cursor=pointer]
  - contentinfo [ref=e140]:
    - generic [ref=e142]:
      - generic [ref=e143]:
        - generic [ref=e144]: Arthur [前]
        - generic [ref=e145]: F.1
      - generic [ref=e147]:
        - generic [ref=e148]: H
        - generic [ref=e151]: "20"
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
> 46  |           expect(box.height, `Button "${text}" (id: ${id}, class: ${className}) on ${screenName} should be >= 44px high. Found: ${box.height}px`).toBeGreaterThanOrEqual(44);
      |                                                                                                                                                   ^ Error: Button "すべて" (id: , class: filter-chip active) on Shop Screen should be >= 44px high. Found: 36px
  47  | 
  48  |           // Verify if key action button is located in the bottom reach zone
  49  |           const isKeyAction = text.includes('戻る') || text.includes('閉じる') || text.includes('確定') || text.includes('決定') || text.includes('購入') || text.includes('売却') || text.includes('鑑定') || text.includes('唱える') || text.includes('加える') || text.includes('外す') || id.includes('btn-submenu-back') || className.includes('tab') || className.includes('filter');
  50  |           if (isKeyAction) {
  51  |             const centerY = box.y + box.height / 2;
  52  |             const threshold = vp.height * 0.50; // In bottom 50% of the screen
  53  |             if (!id.includes('btn-mute')) {
  54  |               expect(centerY, `Key action button "${text}" (id: ${id}) on ${screenName} should be located in the bottom part of the screen (y: ${centerY}px, threshold: ${threshold}px)`).toBeGreaterThan(threshold);
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