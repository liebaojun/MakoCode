// MakoCode capsule position verification
// Usage: node verify-capsule.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    // 1. Navigate to app
    await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000); // Let JS initialize
    console.log('[1] Page loaded');

    // Check title screen state
    const titleState = await page.evaluate(() => {
      const ts = document.getElementById('title-screen');
      const sb = document.getElementById('status-bar');
      const ms = document.getElementById('mode-switcher-container');
      return {
        titleHidden: ts ? ts.classList.contains('hidden') : 'no-el',
        statusVisible: sb ? sb.classList.contains('visible') : 'no-el',
        modeSwVisible: ms ? ms.classList.contains('visible') : 'no-el',
      };
    });
    console.log('[2] Title screen state:', JSON.stringify(titleState));

    // Click "新 游 戏"
    const btn = await page.$('button');
    const btns = await page.$$('button');
    for (const b of btns) {
      const text = await b.textContent();
      if (text.includes('新 游 戏')) {
        await b.click();
        console.log('[3] Clicked "新 游 戏"');
        break;
      }
    }

    // Wait for game UI
    await page.waitForTimeout(1000);

    // Check game state
    const gameState = await page.evaluate(() => {
      const ts = document.getElementById('title-screen');
      const sb = document.getElementById('status-bar');
      const ms = document.getElementById('mode-switcher-container');
      const indicator = document.getElementById('mode-indicator');
      const switcher = document.getElementById('mode-switcher');

      let capsuleInfo = { indicatorFound: !!indicator };
      if (indicator && switcher) {
        const indRect = indicator.getBoundingClientRect();
        const swRect = switcher.getBoundingClientRect();
        capsuleInfo = {
          indicatorTop: indRect.top,
          indicatorHeight: indRect.height,
          switcherTop: swRect.top,
          relativeTop: indRect.top - swRect.top,
          indicatorStyleTop: indicator.style.top,
        };

        // Get all mode item positions
        const items = document.querySelectorAll('.mode-item');
        const itemPositions = [];
        items.forEach((item, i) => {
          const r = item.getBoundingClientRect();
          itemPositions.push({
            index: i,
            text: item.textContent.trim().substring(0, 10),
            top: r.top - swRect.top,
            height: r.height,
            active: item.classList.contains('active'),
          });
        });
        capsuleInfo.itemPositions = itemPositions;
      }

      return {
        titleHidden: ts ? ts.classList.contains('hidden') : 'no-el',
        statusVisible: sb ? sb.classList.contains('visible') : 'no-el',
        modeSwVisible: ms ? ms.classList.contains('visible') : 'no-el',
        capsule: capsuleInfo,
        currentMode: typeof currentPermissionMode !== 'undefined' ? currentPermissionMode : 'unknown',
      };
    });
    console.log('[4] Game state:', JSON.stringify(gameState, null, 2));

    // Verify capsule alignment
    if (gameState.capsule.itemPositions) {
      const relTop = gameState.capsule.relativeTop;
      const items = gameState.capsule.itemPositions;
      const activeItem = items.find(i => i.active);
      console.log(`[5] Capsule relativeTop: ${relTop.toFixed(1)}px`);
      console.log(`[5] Active item: index=${activeItem?.index}, top=${activeItem?.top.toFixed(1)}px`);

      if (activeItem) {
        const diff = Math.abs(relTop - activeItem.top);
        if (diff < 3) {
          console.log(`[VERDICT] PASS - Capsule aligned (diff=${diff.toFixed(1)}px)`);
        } else {
          console.log(`[VERDICT] FAIL - Capsule MISALIGNED (diff=${diff.toFixed(1)}px, expected ~0)`);
        }
      }
    }

    // Screenshot
    await page.screenshot({ path: 'E:/mako-package/scripts/capsule-verify.png', fullPage: false });
    console.log('[6] Screenshot saved to E:/mako-package/scripts/capsule-verify.png');

  } catch (err) {
    console.error('ERROR:', err.message);
    await page.screenshot({ path: 'E:/mako-package/scripts/capsule-error.png' });
    console.log('Error screenshot saved');
  } finally {
    await browser.close();
  }
})();
