const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.goto('http://localhost:5173');
  
  // Wait a bit to let React render
  await new Promise(r => setTimeout(r, 3000));
  
  // We need to trigger the login to see the crash
  // Or maybe it crashes immediately because it uses a cached studentData?
  // Let's see if there are any immediate errors.
  
  await browser.close();
})();
