import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

puppeteer.use(StealthPlugin());

/**
 * Scrapes cards from a specific set
 */
async function scrapeSet(page: any, setName: string, setUrl: string, allCards: Map<string, any>) {
  console.log(`\n=== Scraping ${setName} ===`);
  console.log(`Navigating to: ${setUrl}`);

  await page.goto(setUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await page.waitForTimeout(3000);

  // Check for and clear any filters that might be hiding cards
  console.log('Checking for filters...');
  const filtersInfo = await page.evaluate(() => {
    // Look for filter/reset buttons
    const filterButtons = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
    const resetButton = filterButtons.find(btn => {
      const text = btn.textContent?.toLowerCase() || '';
      return text.includes('reset') || text.includes('clear filter') || text.includes('show all');
    });

    // Look for any active filters or settings
    const activeFilters = Array.from(document.querySelectorAll('[class*="filter"], [class*="active"]')).length;

    return {
      foundResetButton: !!resetButton,
      resetButtonText: resetButton?.textContent || null,
      activeFiltersCount: activeFilters
    };
  });

  console.log(`Filters: ${filtersInfo.activeFiltersCount} active, reset button: ${filtersInfo.foundResetButton} (${filtersInfo.resetButtonText})`);

  // Try to show items per page selector and set to maximum
  await page.evaluate(() => {
    // Look for items per page dropdown
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    selects.forEach(select => {
      // Set to maximum value
      if (select.options.length > 0) {
        const maxOption = Array.from(select.options).sort((a, b) => parseInt(b.value) - parseInt(a.value))[0];
        if (maxOption && parseInt(maxOption.value) > 20) {
          select.value = maxOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  });

  await page.waitForTimeout(2000);

  // Navigate through all pages to collect all cards
  console.log('Collecting cards from all pages...');
  let currentPage = 1;
  let hasMorePages = true;

    while (hasMorePages) {
      console.log(`\nProcessing page ${currentPage}...`);

      // Scroll to load all content on current page
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);

      // Extract cards from current page
      const pageData = await page.evaluate(() => {
        const allLinks = Array.from(document.querySelectorAll('a[href*="/Products/Singles/"]')) as HTMLAnchorElement[];
        const cardLinks = allLinks.filter(link => {
          const href = link.href;
          return href.includes('/Products/Singles/Origins/') || href.includes('/Products/Singles/Proving-Grounds/');
        });

        // Capture sample of non-matching links for debugging
        const nonMatchingLinks = allLinks.filter(link => {
          const href = link.href;
          return !href.includes('/Products/Singles/Origins/') && !href.includes('/Products/Singles/Proving-Grounds/');
        });

        const nonMatchingSamples = nonMatchingLinks.slice(0, 5).map(link => ({
          href: link.href,
          text: link.textContent?.trim()
        }));

        const cards: any[] = [];

        cardLinks.forEach(link => {
          const href = link.href;
          const text = link.textContent?.trim() || '';

          // Skip if no text
          if (!text) return;

          // Extract card info from the link text
          // Format is usually: "Card Name (V.1 - Rarity)" or "Card Name"
          const match = text.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
          if (!match) return;

          const cardName = match[1].trim();
          const versionAndRarity = match[2] || '';

          // Parse version and rarity
          let version = 'V.1';
          let rarity = 'Common';

          if (versionAndRarity) {
            const versionMatch = versionAndRarity.match(/V\.?\s*(\d+)/i);
            if (versionMatch) {
              version = `V.${versionMatch[1]}`;
            }

            // Extract rarity
            if (versionAndRarity.includes('Legendary')) rarity = 'Legendary';
            else if (versionAndRarity.includes('Epic')) rarity = 'Epic';
            else if (versionAndRarity.includes('Rare')) rarity = 'Rare';
            else if (versionAndRarity.includes('Common')) rarity = 'Common';
            else if (versionAndRarity.includes('Showcase')) rarity = 'Showcase';
          }

          // Determine card type from context (this is a rough guess)
          let type = 'Spell'; // Default
          const lowerName = cardName.toLowerCase();

          // Common patterns for card types
          if (lowerName.includes('rune')) type = 'Rune';
          else if (lowerName.includes('landmark') || lowerName.includes('nexus')) type = 'Landmark';
          else if (text.match(/,/)) type = 'Champion'; // Champions usually have comma in name

          const key = `${cardName}-${version}-${rarity}`;

          cards.push({
            key,
            name: cardName,
            version: version,
            rarity: rarity,
            type: type,
            cardMarketUrl: href,
            fullText: text
          });
        });

        return {
          cards: cards,
          totalLinks: allLinks.length,
          matchingLinks: cardLinks.length,
          nonMatchingSamples: nonMatchingSamples
        };
      });

      console.log(`DEBUG: Page has ${pageData.totalLinks} total product links, ${pageData.matchingLinks} match Origins/Proving-Grounds pattern`);
      if (pageData.nonMatchingSamples.length > 0) {
        console.log('Sample non-matching links:');
        pageData.nonMatchingSamples.forEach((sample: any) => {
          console.log(`  - ${sample.text}: ${sample.href}`);
        });
      }

      // Add cards to the master collection
      pageData.cards.forEach((card: any) => {
        allCards.set(card.key, card);
      });

      console.log(`Found ${pageData.cards.length} cards on page ${currentPage} (${allCards.size} unique total)`);

      // Check if there's a next page button
      const paginationInfo = await page.evaluate(() => {
        // Look for pagination "next" button
        const nextButtons = Array.from(document.querySelectorAll('a, button')) as HTMLElement[];

        const nextButton = nextButtons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          return text.includes('next') || text.includes('›') || text.includes('»') ||
                 ariaLabel.includes('next');
        });

        const debugInfo = {
          totalButtons: nextButtons.length,
          foundNextButton: !!nextButton,
          nextButtonText: nextButton?.textContent || null,
          isDisabled: nextButton?.classList.contains('disabled') || false,
          nextPageUrl: null as string | null
        };

        if (nextButton && !nextButton.classList.contains('disabled')) {
          // If it's a link, get the href
          if (nextButton.tagName === 'A') {
            debugInfo.nextPageUrl = (nextButton as HTMLAnchorElement).href;
          } else {
            // Otherwise return a flag to click it
            debugInfo.nextPageUrl = 'CLICK';
          }
        }

        return debugInfo;
      });

      console.log(`Pagination debug: Found ${paginationInfo.totalButtons} buttons/links, nextButton: ${paginationInfo.foundNextButton}, disabled: ${paginationInfo.isDisabled}, text: "${paginationInfo.nextButtonText}"`);

      const nextPageUrl = paginationInfo.nextPageUrl;

      if (nextPageUrl === 'CLICK') {
        // Click the button and wait for navigation
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.evaluate(() => {
            const nextButtons = Array.from(document.querySelectorAll('a, button')) as HTMLElement[];
            const nextButton = nextButtons.find(btn => {
              const text = btn.textContent?.toLowerCase() || '';
              return text.includes('next') || text.includes('›') || text.includes('»');
            });
            if (nextButton) {
              (nextButton as HTMLElement).click();
            }
          })
        ]);
        currentPage++;
        await page.waitForTimeout(2000);
      } else if (nextPageUrl && nextPageUrl !== 'CLICK') {
        // Navigate to the next page URL
        await page.goto(nextPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        currentPage++;
        await page.waitForTimeout(2000);
      } else {
        hasMorePages = false;
      }
    }

}

/**
 * Main function to scrape all cards from all sets
 */
async function scrapeAllCards() {
  console.log('Launching browser to scrape all Riftbound cards...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
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

    const allCards = new Map<string, any>();

    // Scrape Origins set
    await scrapeSet(page, 'Origins', 'https://www.cardmarket.com/en/Riftbound/Products/Singles/Origins', allCards);

    // Scrape Proving Grounds set
    await scrapeSet(page, 'Proving Grounds', 'https://www.cardmarket.com/en/Riftbound/Products/Singles/Proving-Grounds', allCards);

    const cards = Array.from(allCards.values());

    console.log(`\n=== TOTAL: Found ${cards.length} unique cards across all sets ===`);

    // Generate TypeScript code for the database
    const tsCode = `// Database of all Riftbound cards with their CardMarket URLs
// Auto-generated from CardMarket

export interface CardInfo {
  name: string;
  version: string;
  rarity: string;
  type: string;
  cardMarketUrl: string;
  imageUrl?: string;
}

export const ORIGINS_CARDS: CardInfo[] = [
${cards.map(card => {
  const fileName = `${card.name.replace(/[^a-zA-Z0-9]/g, '-')}-${card.version.replace('.', '')}-${card.rarity}.jpg`;
  return `  {
    name: "${card.name.replace(/"/g, '\\"')}",
    version: "${card.version}",
    rarity: "${card.rarity}",
    type: "${card.type}",
    cardMarketUrl: "${card.cardMarketUrl}",
    imageUrl: "/images/cards/${fileName}"
  }`;
}).join(',\n')}
];

// Helper functions
export function getAllCardNames(): string[] {
  const names = new Set(ORIGINS_CARDS.map(card => card.name));
  return Array.from(names).sort();
}

export function getCardVersions(cardName: string): CardInfo[] {
  return ORIGINS_CARDS.filter(card => card.name === cardName);
}

export function getCard(name: string, version: string, rarity: string): CardInfo | undefined {
  return ORIGINS_CARDS.find(
    card => card.name === name && card.version === version && card.rarity === rarity
  );
}

export function getCardsByType(type: string): CardInfo[] {
  return ORIGINS_CARDS.filter(card => card.type === type);
}
`;

    // Save to file
    fs.writeFileSync('src/cards-database.ts', tsCode);
    console.log('\n✓ Saved to src/cards-database.ts');

    // Save raw JSON for reference
    fs.writeFileSync('cards-list.json', JSON.stringify(cards, null, 2));
    console.log('✓ Saved raw data to cards-list.json');

    console.log(`\n${cards.length} cards added to database!`);
    console.log('\nNext steps:');
    console.log('1. Run: npm run fetch-images');
    console.log('2. Run: npm run build');
    console.log('3. Restart the server');

  } finally {
    await browser.close();
  }
}

// Run the scraper
scrapeAllCards().catch(console.error);
