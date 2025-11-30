export interface CardListing {
  price: number;
  seller: string;
  country: string;
  condition?: string;
  language?: string;
}

export interface CardSearchResult {
  listings: CardListing[];
  averagePrice: number;
  cardName?: string;
  setName?: string;
}

export interface SearchParams {
  cardName: string;
  setName?: string; // Optional - helps narrow search to specific set
}
