import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import { ORIGINS_CARDS } from './cards-database';

puppeteer.use(StealthPlugin());

/**
 * Fetches card images from CardMarket and saves them locally
 */
async function fetchCardImages() {
  console.log('Starting card image fetch...');
  console.log(`Found ${ORIGINS_CARDS.length} cards to process\n`);

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Listen to console messages from the page for debugging
    page.on('console', msg => console.log('  PAGE LOG:', msg.text()));

    await page.setViewport({ width: 1920, height: 1080 });

    // Set English language
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setCookie({
      name: 'language',
      value: '1',
      domain: '.cardmarket.com',
      path: '/'
    });

    const imageDir = path.join(__dirname, '../public/images/cards');
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    for (const card of ORIGINS_CARDS) {
      const fileName = `${card.name.replace(/[^a-zA-Z0-9]/g, '-')}-${card.version.replace('.', '')}-${card.rarity}.jpg`;
      const filePath = path.join(imageDir, fileName);

      // Skip if already exists
      if (fs.existsSync(filePath)) {
        console.log(`✓ Skipping ${card.name} (${card.version} - ${card.rarity}) - already exists`);
        continue;
      }

      console.log(`Fetching: ${card.name} (${card.version} - ${card.rarity})`);

      try {
        await page.goto(card.cardMarketUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        await page.waitForTimeout(3000);

        // Extract the version from the URL for matching
        const urlVersion = card.cardMarketUrl.match(/-(V\d+)-/i)?.[1] || card.version.replace('.', '');
        console.log(`  Looking for version: ${urlVersion}`);

        // Try to find the card image - use page title to match
        const imageUrl = await page.evaluate(() => {
          // Get the main product title from H1
          const h1 = document.querySelector('h1');
          const pageTitle = h1 ? h1.textContent?.trim() || '' : '';
          console.log(`Page title: "${pageTitle}"`);

          // Get ALL images and check both src and data-echo
          const allImages = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];

          // Filter to only product-images URLs
          const productImages = allImages
            .filter(img => {
              const src = img.src || img.getAttribute('data-echo') || '';
              return src.includes('product-images.s3.cardmarket.com');
            })
            .map(img => {
              const rect = img.getBoundingClientRect();
              const src = img.src || img.getAttribute('data-echo') || '';
              const productId = src.match(/\/(\d+)\.jpg/)?.[1] || 'unknown';

              // Get the parent link or card container
              const link = img.closest('a') as HTMLAnchorElement;
              const container = img.closest('[class*="card"], [class*="product"], div');
              const linkText = link ? link.textContent?.trim() || '' : '';
              const containerText = container ? container.textContent?.trim() || '' : '';

              // Check if nearby text matches the page title
              const matchesTitle = linkText.includes(pageTitle.split('(')[0].trim()) ||
                                    containerText.includes(pageTitle.split('(')[0].trim());

              return {
                img,
                src,
                productId,
                top: rect.top,
                left: rect.left,
                width: rect.width,
                linkText: linkText.substring(0, 50),
                matchesTitle
              };
            })
            .filter(item => item.width > 100);

          console.log(`Found ${productImages.length} product images`);

          // Log all images
          productImages.forEach((item, i) => {
            console.log(`Image ${i + 1}: ID=${item.productId} Match=${item.matchesTitle} Text="${item.linkText}"`);
          });

          // Prefer images that match the page title
          const matching = productImages.filter(img => img.matchesTitle);
          const candidates = matching.length > 0 ? matching : productImages;

          console.log(`${candidates.length} candidates after filtering`);

          // Sort by Y position, then X position
          candidates.sort((a, b) => {
            if (Math.abs(a.top - b.top) < 10) {
              return a.left - b.left;
            }
            return a.top - b.top;
          });

          // WORKAROUND: Try the MIDDLE image instead of leftmost (index 1 instead of 0)
          // This seems to work better for CardMarket's layout
          if (candidates.length >= 2) {
            console.log(`Using MIDDLE image instead of leftmost: ID=${candidates[1].productId}`);
            return candidates[1].src;
          } else if (candidates.length > 0) {
            console.log(`Using image: ID=${candidates[0].productId}`);
            return candidates[0].src;
          }

          return null;
        });

        if (imageUrl) {
          console.log(`  Found image URL: ${imageUrl}`);

          // Download the image
          const imageResponse = await page.goto(imageUrl, { waitUntil: 'networkidle2' });
          if (imageResponse) {
            const buffer = await imageResponse.buffer();
            fs.writeFileSync(filePath, buffer);
            console.log(`  ✓ Saved to ${fileName}\n`);
          }
        } else {
          console.log(`  ✗ Could not find image for this card\n`);
        }

        // Wait a bit between requests to be polite
        await page.waitForTimeout(1500);

      } catch (error) {
        console.error(`  ✗ Error fetching ${card.name}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log('\n✓ Image fetch complete!');

  } finally {
    await browser.close();
  }
}

// Run the script
fetchCardImages().catch(console.error);
