import { searchCard } from './scraper';
import { SearchParams } from './types';

/**
 * Main CLI entry point for Riftbound card price tracking
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: npm run dev <card-name> [set-name]');
    console.log('');
    console.log('Examples:');
    console.log('  npm run dev "Thousand-Tailed Watcher"');
    console.log('  npm run dev "Mindsplitter" "Origins"');
    console.log('  npm run dev "Stacked Deck"');
    console.log('');
    console.log('This tool is specifically for Riftbound cards on CardMarket.');
    process.exit(1);
  }

  const params: SearchParams = {
    cardName: args[0],
    setName: args[1] // Optional
  };

  console.log('='.repeat(60));
  console.log('Riftbound Card Price Tracker (CardMarket)');
  console.log('='.repeat(60));

  try {
    const result = await searchCard(params);

    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log('');

    if (result.cardName) {
      console.log(`Card Name: ${result.cardName}`);
    }
    if (result.setName) {
      console.log(`Set: ${result.setName}`);
    }

    console.log('');
    console.log(`Average Price (5 cheapest EU sellers): €${result.averagePrice.toFixed(2)}`);
    console.log('');
    console.log('Listings analyzed:');
    console.log('-'.repeat(60));

    result.listings.forEach((listing, index) => {
      console.log(`${index + 1}. €${listing.price.toFixed(2)} - ${listing.country} (${listing.seller})`);
      if (listing.condition) {
        console.log(`   Condition: ${listing.condition}`);
      }
      if (listing.language) {
        console.log(`   Language: ${listing.language}`);
      }
    });

    console.log('');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('ERROR:', error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('Troubleshooting tips:');
    console.error('- Check that the set name is correct (e.g., "Origins")');
    console.error('- Verify the card number exists in that Riftbound set');
    console.error('- Make sure there are EU sellers for this card');
    console.error('- Check the debug_*.html files for more details');
    console.error('- CardMarket might have changed their HTML structure');
    process.exit(1);
  }
}

// Run the main function
main();
