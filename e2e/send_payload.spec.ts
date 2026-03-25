import { test, expect } from '@playwright/test';

test('send provided chunk via console postMessage', async ({ page }) => {
  page.on('console', (m) => console.log('[page]', m.type(), m.text()));

  const url = 'http://localhost:5174/annotation.html';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#editorFrame');

  const payload = {
    type: 'HIGHLIGHT_BLOCKS',
    blockIds: ['1'],
    result: '不符合',
    chunks: {
      '1': {
        content: '本合約維護標的物係指甲方委由乙方開發之「合約管理系統」（以下簡稱本系統）。',
      },
    },
  };

  await page.evaluate((payload) => {
    const frame = document.getElementById('editorFrame');
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(payload, '*');
      console.log('posted payload from console-eval');
    } else {
      console.log('editorFrame not available');
    }
  }, payload);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/console_post_page.png', fullPage: true });
  const frameEl = await page.$('#editorFrame');
  if (frameEl) {
    const box = await frameEl.boundingBox();
    if (box)
      await page.screenshot({
        path: 'screenshots/console_post_frame.png',
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
  }

  const contentLength = await page.$eval('#contractContent', (el) => el.innerHTML.length);
  console.log('contractContent length:', contentLength);
});
