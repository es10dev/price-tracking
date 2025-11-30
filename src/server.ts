import express from 'express';
import cors from 'cors';
import { searchCard } from './scraper';
import { SearchParams } from './types';
import * as path from 'path';
import { ORIGINS_CARDS } from './cards-database';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Types for API requests/responses
interface DecklistItem {
  quantity: number;
  cardName: string;
}

interface DecklistRequest {
  decklist: string;
}

interface CardPriceResult {
  cardName: string;
  quantity: number;
  avgPrice: number;
  totalPrice: number;
  error?: string;
}

interface DecklistResponse {
  cards: CardPriceResult[];
  totalPrice: number;
  successCount: number;
  failureCount: number;
}

/**
 * Parse a decklist string into individual card items
 * Format: "3 Thousand-Tailed Watcher\n2 Mindsplitter\n3 Stacked Deck"
 */
function parseDecklist(decklistText: string): DecklistItem[] {
  const lines = decklistText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const items: DecklistItem[] = [];

  for (const line of lines) {
    // Match patterns like "3 Card Name" or "3x Card Name"
    const match = line.match(/^(\d+)x?\s+(.+)$/i);
    if (match) {
      const quantity = parseInt(match[1]);
      const cardName = match[2].trim();
      if (quantity > 0 && cardName) {
        items.push({ quantity, cardName });
      }
    }
  }

  return items;
}

/**
 * POST /api/decklist
 * Accepts a decklist and returns pricing for each card
 */
app.post('/api/decklist', async (req, res) => {
  try {
    const { decklist } = req.body as DecklistRequest;

    if (!decklist || typeof decklist !== 'string') {
      return res.status(400).json({ error: 'Invalid decklist format' });
    }

    console.log('\n' + '='.repeat(60));
    console.log('New decklist request received');
    console.log('='.repeat(60));

    const items = parseDecklist(decklist);

    if (items.length === 0) {
      return res.status(400).json({ error: 'No valid cards found in decklist' });
    }

    console.log(`Processing ${items.length} unique cards...`);

    const results: CardPriceResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each card sequentially (to avoid overwhelming CardMarket)
    for (const item of items) {
      console.log(`\nLooking up: ${item.quantity}x ${item.cardName}`);

      try {
        const params: SearchParams = {
          cardName: item.cardName,
          setName: 'Origins' // You can make this configurable
        };

        const result = await searchCard(params);

        const cardResult: CardPriceResult = {
          cardName: item.cardName,
          quantity: item.quantity,
          avgPrice: result.averagePrice,
          totalPrice: result.averagePrice * item.quantity
        };

        results.push(cardResult);
        successCount++;

        console.log(`✓ Found: €${result.averagePrice.toFixed(2)} × ${item.quantity} = €${cardResult.totalPrice.toFixed(2)}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`✗ Failed: ${errorMsg}`);

        results.push({
          cardName: item.cardName,
          quantity: item.quantity,
          avgPrice: 0,
          totalPrice: 0,
          error: errorMsg
        });

        failureCount++;
      }
    }

    const totalPrice = results.reduce((sum, card) => sum + card.totalPrice, 0);

    const response: DecklistResponse = {
      cards: results,
      totalPrice,
      successCount,
      failureCount
    };

    console.log('\n' + '='.repeat(60));
    console.log(`Total Price: €${totalPrice.toFixed(2)}`);
    console.log(`Success: ${successCount}, Failed: ${failureCount}`);
    console.log('='.repeat(60) + '\n');

    res.json(response);

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Riftbound Price Tracker API is running' });
});

/**
 * GET /api/cards
 * Returns all available Origins cards
 */
app.get('/api/cards', (req, res) => {
  res.json(ORIGINS_CARDS);
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('Riftbound CardMarket Price Tracker - Web Server');
  console.log('='.repeat(60));
  console.log(`Server running at: http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/decklist`);
  console.log('='.repeat(60) + '\n');
});
