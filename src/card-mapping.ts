/**
 * Mapping of Riftbound card numbers to their CardMarket URL slugs
 * Format: [setName][cardNumber] = urlSlug
 *
 * To add a new card:
 * 1. Find the card on CardMarket (e.g., https://www.cardmarket.com/en/Riftbound/Products/Singles/Origins/The-Harrowing)
 * 2. Extract the URL slug (the last part after the set name: "The-Harrowing")
 * 3. Add it to the mapping below
 */

interface CardMapping {
  [setName: string]: {
    [cardNumber: string]: string;
  };
}

export const CARD_MAPPING: CardMapping = {
  'Origins': {
    '198': 'The-Harrowing',
    // Add more Origins cards here
    // '001': 'Card-Name-Here',
    // '002': 'Another-Card',
  },
  // Add more sets here
  // 'Dawnbreak': {
  //   '001': 'Card-Name',
  // },
};

/**
 * Gets the CardMarket URL slug for a given set and card number
 * @param setName - The set name (e.g., "Origins")
 * @param cardNumber - The card number (e.g., "198")
 * @returns The URL slug for the card, or null if not found
 */
export function getCardSlug(setName: string, cardNumber: string): string | null {
  const set = CARD_MAPPING[setName];
  if (!set) return null;

  return set[cardNumber] || null;
}

/**
 * Builds the full CardMarket URL for a card
 * @param setName - The set name
 * @param cardSlug - The card's URL slug
 * @returns The full CardMarket URL
 */
export function buildCardUrl(setName: string, cardSlug: string): string {
  return `https://www.cardmarket.com/en/Riftbound/Products/Singles/${setName}/${cardSlug}`;
}
