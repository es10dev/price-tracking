// List of EU member states (as of 2024)
// Note: UK left the EU in 2020, Switzerland is not an EU member
export const EU_COUNTRIES = new Set([
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czech Republic',
  'Czechia',
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Ireland',
  'Italy',
  'Latvia',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
  // Common variations and language-specific names
  'Deutschland',
  'Österreich',
  'Belgique',
  'België',
  'España',
  'Polska',
  'Česká republika',
  'Slovensko',
  'Magyarország',
  'Suomi',
  'Ελλάδα',
  'Éire',
  'Lietuva',
  'Latvija',
  'Luxemburg',
  'Hrvatska',
  'România',
  'България',
  'Κύπρος',
  'Eesti',
  'Malta'
]);

/**
 * Checks if a country is part of the EU
 * @param country - Country name to check
 * @returns true if the country is in the EU, false otherwise
 */
export function isEUCountry(country: string): boolean {
  return EU_COUNTRIES.has(country.trim());
}
