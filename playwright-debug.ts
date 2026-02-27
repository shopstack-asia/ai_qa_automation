import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();
  await page.goto('https://google.com');

  console.log(await page.title());

  await page.waitForTimeout(5000);
})();