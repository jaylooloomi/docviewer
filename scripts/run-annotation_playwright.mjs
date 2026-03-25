import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    try {
      const args = msg.args();
      const texts = args.map(a => a._initializer ? a._initializer.value : a.toString());
      // fallback
      console.log(`[page.console] ${msg.type()}: ${msg.text()}`);
    } catch (e) {
      console.log(`[page.console] ${msg.type()}: ${msg.text()}`);
    }
  });

  const url = 'http://localhost:5174/annotation.html';
  console.log('navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // wait for iframe
  await page.waitForSelector('#editorFrame');
  console.log('iframe present');
  // Click the Test Highlight button in the parent page to trigger the postMessage
  const btn = await page.$('#testHighlightBtn');
  if (btn) {
    console.log('clicking testHighlightBtn');
    await btn.click();
  } else {
    console.log('testHighlightBtn not found');
  }

  // wait for diagnostics to appear in console
  await page.waitForTimeout(2000);

  // capture DOM snapshot of contractContent and of editor iframe body
  const contractHtml = await page.$eval('#contractContent', el => el.innerHTML);
  console.log('contractContent length:', contractHtml.length);

  // screenshot the whole page
  await page.screenshot({ path: 'screenshots/annotation_page.png', fullPage: true });

  // try to screenshot iframe content (if same-origin)
  try {
    const frame = page.frame({ name: '' });
    // fallback: get iframe element bounding box
    const frameEl = await page.$('#editorFrame');
    const box = await frameEl.boundingBox();
    if (box) {
      await page.screenshot({ path: 'screenshots/annotation_frame.png', clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
      console.log('frame screenshot saved');
    }
  } catch (e) {
    console.log('failed to screenshot iframe:', e.message);
  }

  await browser.close();
  console.log('done');
})();
