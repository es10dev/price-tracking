import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

puppeteer.use(StealthPlugin());

interface CardInfo {
  number: string;
  name: string;
  urlSlug: string;
}

/**
 * Scrapes a Riftbound set page on CardMarket and generates card number to URL slug mappings
 * @param setName - The set name (e.g., "Origins")
 * @returns Array of card information
 */
export async function generateSetMapping(setName: string): Promise<CardInfo[]> {
  console.log(`\nGenerating card mapping for set: ${setName}`);
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const setUrl = `https://www.cardmarket.com/en/Riftbound/Products/Singles/${setName}`;
    console.log(`\nNavigating to: ${setUrl}`);

    await page.goto(setUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Handle cookie consent
    try {
      const acceptButton = await page.waitForSelector('button:has-text("Accept All Cookies"), button:has-text("Accept all"), button[class*="accept"]', {
        timeout: 5000
      });
      if (acceptButton) {
        await acceptButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.log('No cookie banner found');
    }

    // Wait for cards to load
    console.log('Waiting for cards to load...');
    await page.waitForTimeout(5000);

    // Save debug screenshot and HTML
    await page.screenshot({ path: `debug_set_${setName}.png`, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(`debug_set_${setName}.html`, html);
    console.log(`Debug files saved: debug_set_${setName}.html and .png`);

    // Debug: Check page structure
    const pageStructure = await page.evaluate(() => {
      return {
        title: document.title,
        h1: document.querySelector('h1')?.textContent,
        tables: document.querySelectorAll('table').length,
        rows: document.querySelectorAll('tr').length,
        cards: document.querySelectorAll('[class*="card"]').length,
        productLinks: document.querySelectorAll('a[href*="/Products/Singles/"]').length
      };
    });
    console.log('Page structure:', JSON.stringify(pageStructure, null, 2));

    // Extract card information
    console.log('Extracting card information...');
    const cards = await page.evaluate(() => {
      const results: CardInfo[] = [];

      // Find all card links - try multiple selectors
      const selectors = [
        'a[href*="/Singles/"]',
        '.table a[href*="/Products/"]',
        'a[class*="card"]',
        'a[href*="/Riftbound/Products/Singles/"]'
      ];

      let links: HTMLAnchorElement[] = [];
      for (const selector of selectors) {
        const found = Array.from(document.querySelectorAll(selector)) as HTMLAnchorElement[];
        if (found.length > 0) {
          links = found;
          break;
        }
      }

      // Process each link
      const seen = new Set<string>();
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || !href.includes('/Singles/')) return;

        // Extract URL slug from href
        // Format: /en/Riftbound/Products/Singles/Origins/The-Harrowing
        const parts = href.split('/');
        const urlSlug = parts[parts.length - 1];

        // Skip if already seen
        if (seen.has(urlSlug)) return;
        seen.add(urlSlug);

        // Try to find card number - look in the row/parent elements
        let cardNumber = '';
        let cardName = urlSlug.replace(/-/g, ' ');

        // Look for card number in nearby text
        const parent = link.closest('tr') || link.closest('div[class*="row"]') || link.parentElement;
        if (parent) {
          const text = parent.textContent || '';

          // Try to find a number that looks like a card number (e.g., #123, 001, etc.)
          const numberMatch = text.match(/#?(\d{1,3})\s/);
          if (numberMatch) {
            cardNumber = numberMatch[1];
          }
        }

        // Get card name from link text or title
        const linkText = link.textContent?.trim() || link.getAttribute('title') || '';
        if (linkText && linkText.length > 0 && !linkText.includes('http')) {
          cardName = linkText;
        }

        if (urlSlug) {
          results.push({
            number: cardNumber,
            name: cardName,
            urlSlug
          });
        }
      });

      return results;
    });

    console.log(`\nFound ${cards.length} cards`);

    return cards;

  } finally {
    await browser.close();
  }
}

/**
 * Formats card info as TypeScript code for the mapping file
 */
export function formatMappingCode(setName: string, cards: CardInfo[]): string {
  const lines: string[] = [
    `  '${setName}': {`
  ];

  // Sort by card number if available
  const sortedCards = cards.sort((a, b) => {
    const numA = parseInt(a.number) || 999999;
    const numB = parseInt(b.number) || 999999;
    return numA - numB;
  });

  sortedCards.forEach(card => {
    if (card.number) {
      lines.push(`    '${card.number}': '${card.urlSlug}', // ${card.name}`);
    } else {
      lines.push(`    // '???': '${card.urlSlug}', // ${card.name} (number not found)`);
    }
  });

  lines.push(`  },`);

  return lines.join('\n');
}

// CLI usage
if (require.main === module) {
  const setName = process.argv[2];

  if (!setName) {
    console.log('Usage: ts-node src/generate-mapping.ts <set-name>');
    console.log('Example: ts-node src/generate-mapping.ts "Origins"');
    process.exit(1);
  }

  generateSetMapping(setName)
    .then(cards => {
      console.log('\n' + '='.repeat(60));
      console.log('CARD MAPPING CODE');
      console.log('='.repeat(60));
      console.log('\nCopy this code into src/card-mapping.ts:\n');
      console.log(formatMappingCode(setName, cards));
      console.log('\n' + '='.repeat(60));

      // Also save to file
      const outputFile = `mapping_${setName}.txt`;
      fs.writeFileSync(outputFile, formatMappingCode(setName, cards));
      console.log(`\nMapping also saved to: ${outputFile}`);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
