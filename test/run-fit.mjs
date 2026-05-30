import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/node_modules/puppeteer-core');
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(__dirname, 'fit.html');

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
  await page.setViewport({ width: 500, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => document.title === 'DONE', { timeout: 5000 });
  } catch {
    const title = await page.title();
    const html = await page.content();
    console.error('TIMEOUT — title=', title);
    console.error('PAGE HTML head ' + html.length + ' chars, first 800:\n' + html.slice(0, 800));
    throw new Error('timeout');
  }
  const result = await page.evaluate(() => window.__TEST_RESULT__);

  console.log(JSON.stringify(result, null, 2));

  const fail = (msg) => {
    console.error('\nFAIL: ' + msg);
    process.exitCode = 1;
  };

  if (result.containerWidth !== 393) fail(`containerWidth expected 393, got ${result.containerWidth}`);
  if (result.iframeClientWidth !== 393) fail(`iframeClientWidth expected 393, got ${result.iframeClientWidth}`);
  if (result.hasHorizontalOverflow) fail('iframe document still has horizontal overflow');
  if (result.wrapBoundingRect && result.wrapBoundingRect > result.iframeClientWidth + 1) {
    fail(`wrap visual width ${result.wrapBoundingRect} > iframe ${result.iframeClientWidth}`);
  }

  if (process.exitCode !== 1) {
    console.log('\nPASS — wide email fits without horizontal overflow.');
  }
} finally {
  await browser.close();
}
