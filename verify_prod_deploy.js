import { chromium } from 'playwright';

const URL = 'https://suman8055.github.io/musicplayer/';

(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage();

  try {
    console.log('\n🔍 Verifying production deployment...\n');

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Extract version from settings
    const version = await page.evaluate(() => {
      const body = document.body.textContent;
      const match = body.match(/v?5\.2\.7\d+/);
      return match ? match[0] : 'UNKNOWN';
    });

    console.log(`Production version: ${version}`);

    if (version.includes('5.2.7')) {
      console.log('✅ v5.2.7x detected — deployment successful!\n');
    } else {
      console.log('⚠️  Version may not be updated yet (GH Pages cache)\n');
    }

  } finally {
    await b.close();
  }
})();
