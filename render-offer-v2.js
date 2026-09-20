const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:8766/offer-preview-v2.html', { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: '/Users/patrickherling/Downloads/Tere_Doctor_Contractor_Offer_v2.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: '22mm', bottom: '24mm', left: '20mm', right: '20mm' },
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log('OK');
})().catch(err => { console.error(err); process.exit(1); });
