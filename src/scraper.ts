import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import { CardListing, CardSearchResult, SearchParams } from './types';
import { isEUCountry } from './countries';
// Removed card-mapping dependency - now searching by name

// Add stealth plugin to make Puppeteer harder to detect
puppeteer.use(StealthPlugin());

const DEBUG = false; // Enable debug mode to save HTML files and screenshots

/**
 * Searches for a Riftbound card on CardMarket by name and returns price information
 * @param params - Search parameters (card name, optional set name)
 * @returns Card search results with listings and average price
 */
export async function searchCard(
  params: SearchParams
): Promise<CardSearchResult> {
  console.log('\nLaunching browser with stealth mode...');
  const browser = await puppeteer.launch({
    headless: false, // Run in visible mode to bypass some Cloudflare checks
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Set English as preferred language to prevent auto-redirect to French
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    // Set language cookie to force English
    await page.setCookie({
      name: 'language',
      value: '1', // 1 = English on CardMarket
      domain: '.cardmarket.com',
      path: '/'
    });

    // Parse the card name to extract base name and version/rarity info
    // Format examples: "Calm Rune (V.2 - Showcase)", "Calm Rune V.2 Common", "Calm-Rune-V2-Common"
    const versionMatch = params.cardName.match(/^(.+?)\s*(?:\(|-)?\s*(?:V\.?|v\.?)?\s*(\d+)\s*[-\s]*(?:Showcase|Common|Rare|Epic|Legendary)?(?:\))?$/i);

    let baseCardName = params.cardName;
    let versionNumber: string | null = null;

    if (versionMatch) {
      baseCardName = versionMatch[1].trim();
      versionNumber = versionMatch[2];
      console.log(`Parsed card name: "${baseCardName}" (Version ${versionNumber})`);
    } else {
      console.log(`\nSearching for: "${params.cardName}"`);
    }

    if (params.setName) {
      console.log(`Set filter: ${params.setName}`);
    }

    // Search for the base card name using CardMarket's search
    const searchUrl = `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${encodeURIComponent(baseCardName)}`;
    console.log(`\nNavigating to search page...`);

    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Handle cookie consent banner
    console.log('Checking for cookie consent...');
    try {
      const acceptButton = await page.waitForSelector('button:has-text("Accept All Cookies"), button:has-text("Accept all"), button[class*="accept"]', {
        timeout: 5000
      });
      if (acceptButton) {
        await acceptButton.click();
        console.log('Accepted cookies');
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.log('No cookie banner found or already accepted');
    }

    // Wait for search results and find the card
    console.log('Looking for search results...');
    await page.waitForTimeout(2000);

    // Find the matching card link (prioritize version matches if specified)
    const cardUrl = await page.evaluate((searchName, setFilter, versionNum) => {
      const links = Array.from(document.querySelectorAll('a[href*="/Products/Singles/"]')) as HTMLAnchorElement[];

      // Filter by set first if provided
      const setFilteredLinks = setFilter
        ? links.filter(link => link.href.includes(`/Singles/${setFilter}/`))
        : links;

      if (setFilteredLinks.length === 0) {
        return links[0]?.href || null;
      }

      // If a version number was specified, try to find the matching version
      if (versionNum) {
        // Look for V{number} or V.{number} in the URL
        const versionPattern = new RegExp(`-V\\.?${versionNum}-`, 'i');

        for (const link of setFilteredLinks) {
          if (versionPattern.test(link.href)) {
            return link.href;
          }
        }

        // If no exact version match found, log available versions
        console.log('Available versions:', setFilteredLinks.map(l => l.href).join(', '));
      }

      // Try to find exact text match
      for (const link of setFilteredLinks) {
        const linkText = link.textContent?.trim().toLowerCase() || '';
        const searchLower = searchName.toLowerCase();
        if (linkText === searchLower) {
          return link.href;
        }
      }

      // Fall back to first result in set
      return setFilteredLinks[0]?.href || null;
    }, baseCardName, params.setName, versionNumber);

    if (!cardUrl) {
      throw new Error(`Could not find card "${params.cardName}" in search results`);
    }

    // Force English version of the page (replace /fr/, /de/, etc. with /en/)
    const englishCardUrl = cardUrl.replace(/\/[a-z]{2}\/Riftbound/, '/en/Riftbound');
    console.log(`Found card, navigating to: ${englishCardUrl}`);

    // Navigate to the card page
    await page.goto(englishCardUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for listings to load - specifically wait for article rows
    console.log('Waiting for listings to load...');
    try {
      await page.waitForSelector('.article-row, [id*="articleRow"]', {
        timeout: 10000
      });
      console.log('Listings element found!');
    } catch (error) {
      console.log('Warning: Could not find expected listings element, will try to extract anyway...');
    }

    // Additional wait to ensure dynamic content is fully loaded
    await page.waitForTimeout(3000);

    if (DEBUG) {
      // Take a screenshot
      await page.screenshot({ path: 'debug_card_page.png', fullPage: true });
      console.log('Screenshot saved to debug_card_page.png');

      const cardHtml = await page.content();
      fs.writeFileSync('debug_card_page.html', cardHtml);
      console.log('Card page saved to debug_card_page.html');

      // Debug: Print what elements are on the page
      const pageInfo = await page.evaluate(() => {
        return {
          tables: document.querySelectorAll('table').length,
          tbody: document.querySelectorAll('tbody').length,
          tableRows: document.querySelectorAll('tr').length,
          divs: document.querySelectorAll('div').length,
          buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).slice(0, 10),
          links: Array.from(document.querySelectorAll('a')).map(a => a.textContent?.trim()).slice(0, 20),
          priceElements: document.querySelectorAll('[class*="price"], [class*="Price"]').length,
          articleElements: document.querySelectorAll('[class*="article"], [class*="Article"]').length
        };
      });
      console.log('Page structure:', JSON.stringify(pageInfo, null, 2));

      // Print HTML of first article-row to understand price structure
      const articleRowSample = await page.evaluate(() => {
        const firstRow = document.querySelector('.article-row');
        if (!firstRow) return null;

        // Look for price-related elements
        const offerCol = firstRow.querySelector('.col-offer');
        const priceElements = Array.from(firstRow.querySelectorAll('[class*="price"]')).map(el => ({
          className: el.className,
          text: el.textContent?.trim()
        }));

        // Get all text with euro symbols
        const allEuroPrices = (firstRow.textContent || '').match(/\d+[.,]\d{2}\s*€/g);

        return {
          offerColumnHTML: offerCol ? offerCol.outerHTML.substring(0, 800) : 'NOT FOUND',
          offerColumnText: offerCol ? offerCol.textContent?.trim() : 'NOT FOUND',
          priceElements,
          allEuroPricesInRow: allEuroPrices,
          fullRowText: firstRow.textContent?.substring(0, 300)
        };
      });

      if (articleRowSample) {
        console.log('\n=== First Article Row Price Debug ===');
        console.log('Offer column HTML:', articleRowSample.offerColumnHTML);
        console.log('\nOffer column text:', articleRowSample.offerColumnText);
        console.log('\nAll € prices found in row:', articleRowSample.allEuroPricesInRow);
        console.log('\nFull row text:', articleRowSample.fullRowText);
      }
    }

    // Extract card information
    const cardName = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.textContent?.trim() || 'Unknown' : 'Unknown';
    });

    const setName = await page.evaluate(() => {
      const setElem = document.querySelector('.text-muted, .expansion-symbol, [class*="set"]');
      return setElem ? setElem.textContent?.trim() || 'Unknown' : 'Unknown';
    });

    console.log(`\nCard found: ${cardName}`);
    console.log(`Set: ${setName}`);

    // Extract listings from the page
    console.log('\nExtracting listings...');
    const extractionDebug = await page.evaluate(() => {
      const results: Array<{price: number; seller: string; country: string; condition?: string}> = [];
      const debugInfo: any = { skipped: [] };

      // Try multiple selectors for article/listing elements
      const selectors = [
        '.article-row',
        '[id*="articleRow"]',
        '[class*="article-row"]',
        '[data-article-id]',
        '[class*="listing"]'
      ];

      let items: Element[] = [];
      for (const selector of selectors) {
        items = Array.from(document.querySelectorAll(selector));
        if (items.length > 0) {
          debugInfo.selectorUsed = selector;
          debugInfo.itemsFound = items.length;
          break;
        }
      }

      items.forEach((item, index) => {
        const itemText = item.textContent || '';
        const debugItem: any = { index, reason: null };

        // Extract price from the offer column specifically (not from the whole row)
        const offerCol = item.querySelector('.col-offer');
        const priceMatch = offerCol?.textContent?.match(/(\d+[.,]\d{2})\s*€/);

        // Fallback: try price-related elements
        const priceElem = item.querySelector('[class*="price"], [class*="Price"]');
        const priceMatch2 = priceElem?.textContent?.match(/(\d+[.,]\d{2})\s*€/);

        debugItem.priceMatch = priceMatch?.[1];
        debugItem.priceMatch2 = priceMatch2?.[1];
        debugItem.textSnippet = itemText.substring(0, 100);

        if (!priceMatch && !priceMatch2) {
          debugItem.reason = 'no_price';
          debugInfo.skipped.push(debugItem);
          return;
        }

        const price = parseFloat((priceMatch || priceMatch2)![1].replace(',', '.'));
        debugItem.price = price;

        // Extract country from tooltip attributes (CardMarket uses CSS sprites, not img tags)
        let country = '';

        // Look for element with "Item location:" tooltip
        const locationElement = item.querySelector('[aria-label*="Item location:"], [data-bs-original-title*="Item location:"]');
        if (locationElement) {
          const locationText = locationElement.getAttribute('aria-label') || locationElement.getAttribute('data-bs-original-title') || '';
          // Extract country from "Item location: United Kingdom"
          const match = locationText.match(/Item location:\s*(.+)/);
          if (match) {
            country = match[1].trim();
          }
        }
        debugItem.country = country;
        debugItem.locationElement = locationElement ? 'found' : 'not found';

        // Extract seller
        const sellerLink = item.querySelector('a[href*="/Users/"], a[href*="/user"], a[href*="/seller"]');
        const seller = sellerLink ? sellerLink.textContent?.trim() || 'Unknown' : 'Unknown';
        debugItem.seller = seller;

        // Extract condition
        const conditionMatch = itemText.match(/(MT|NM|EX|GD|LP|PL|PO|MINT|NEAR MINT|EXCELLENT|GOOD|LIGHT PLAYED|PLAYED|POOR)/i);
        const condition = conditionMatch ? conditionMatch[0] : undefined;

        if (country && price) {
          results.push({ price, seller, country, condition });
        } else {
          debugItem.reason = !country ? 'no_country' : 'unknown';
          // Only store first 5 skipped items for debugging
          if (debugInfo.skipped.length < 5) {
            debugInfo.skipped.push(debugItem);
          }
        }
      });

      return { results, debugInfo };
    });

    const listings = extractionDebug.results;
    if (DEBUG) {
      console.log('Extraction debug:', JSON.stringify(extractionDebug.debugInfo, null, 2));
    }

    console.log(`\nFound ${listings.length} total listings`);

    if (listings.length === 0) {
      throw new Error('No listings found on the card page. Check debug_card_page.html to see the actual page structure.');
    }

    // Debug: show first few listings
    if (DEBUG && listings.length > 0) {
      console.log('\nFirst 3 listings:');
      listings.slice(0, 3).forEach((l, i) => {
        console.log(`  ${i + 1}. €${l.price} - ${l.country} (${l.seller})`);
      });
    }

    // Filter for EU countries only
    const euListings = listings.filter(listing => isEUCountry(listing.country));

    console.log(`\nFound ${euListings.length} EU listings (filtered from ${listings.length} total)`);

    if (euListings.length === 0) {
      const countries = [...new Set(listings.map(l => l.country))];
      console.log('Countries found:', countries.join(', '));
      throw new Error('No listings found from EU countries');
    }

    // Sort by price and take the first 5
    const cheapestFive = euListings
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);

    console.log(`\nAnalyzing top ${cheapestFive.length} cheapest EU listings`);

    // Calculate average price
    const averagePrice = cheapestFive.reduce((sum, listing) => sum + listing.price, 0) / cheapestFive.length;

    return {
      listings: cheapestFive,
      averagePrice,
      cardName,
      setName
    };

  } finally {
    await browser.close();
  }
}
