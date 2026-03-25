import { test, expect } from '@playwright/test';

test('annotation highlight diagnostics', async ({ page }) => {
  page.on('console', (m) => console.log('[page]', m.type(), m.text()));

  const url = 'http://localhost:5174/annotation.html';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#editorFrame');

  // Try to extract chunks from page
  const chunks = await page.evaluate(() => {
    try {
      if (
        window.parsedData &&
        window.parsedData.return_content &&
        window.parsedData.return_content.contract_chunks
      ) {
        return window.parsedData.return_content.contract_chunks;
      }
    } catch (e) {}
    try {
      if (
        (window as any).SAMPLE_JSON &&
        (window as any).SAMPLE_JSON.return_content &&
        (window as any).SAMPLE_JSON.return_content.contract_chunks
      ) {
        return (window as any).SAMPLE_JSON.return_content.contract_chunks;
      }
    } catch (e) {}
    return null;
  });

  console.log('chunks present:', !!chunks);

  // Post message to iframe
  await page.evaluate((chunks) => {
    const payload = { type: 'HIGHLIGHT_BLOCKS', blockIds: ['1'], result: '不符合', chunks };
    const frame = document.getElementById('editorFrame');
    if (frame && (frame as HTMLIFrameElement).contentWindow) {
      (frame as HTMLIFrameElement).contentWindow.postMessage(payload, '*');
      console.log('posted HIGHLIGHT_BLOCKS');
    } else {
      console.log('no iframe window');
    }
  }, chunks);

  // wait for plugin logs
  await page.waitForTimeout(2000);

  // save screenshots
  await page.screenshot({ path: 'screenshots/annotation_page.png', fullPage: true });
  const frameEl = await page.$('#editorFrame');
  if (frameEl) {
    const box = await frameEl.boundingBox();
    if (box) {
      await page.screenshot({
        path: 'screenshots/annotation_frame.png',
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
    }
  }

  // Dump contractContent length
  const contentLength = await page.$eval('#contractContent', (el) => el.innerHTML.length);
  console.log('contractContent length:', contentLength);
});
