import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = 'http://localhost:5174/annotation.html';
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#editorFrame');

  const payload = {
    type: 'HIGHLIGHT_BLOCKS',
    blockIds: ['1'],
    result: '不符合',
    chunks: {
      '1': {
        content: '本合約維護標的物係指甲方委由乙方開發之「合約管理系統」（以下簡稱本系統）。'
      }
    }
  };

  // Post message from parent context
  await page.evaluate((payload) => {
    const frame = document.getElementById('editorFrame');
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(payload, '*');
      console.log('posted payload from console-eval');
    } else {
      console.log('editorFrame not available');
    }
  }, payload);

  // wait for ACK and render
  await page.waitForTimeout(1600);

  // screenshots
  await page.screenshot({ path: 'screenshots/console_post_page.png', fullPage: true });
  const frameEl = await page.$('#editorFrame');
  if (frameEl) {
    const box = await frameEl.boundingBox();
    if (box) {
      await page.screenshot({ path: 'screenshots/console_post_frame.png', clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    }
  }

  // collect console messages from the page by evaluating window._lastConsole (if any)
  const logs = await page.evaluate(() => {
    try {
      return (window.__lastConsole || null);
    } catch (e) { return null; }
  });
  console.log('page logs snapshot:', logs);

  await browser.close();
})();
