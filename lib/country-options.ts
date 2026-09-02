import countries from "world-countries";

export type CountryOption = {
  /** Common English name (stored in DB) */
  name: string;
  /** ISO 3166-1 alpha-2 (e.g. JP, US) */
  cca2: string;
};

const allCountries: CountryOption[] = countries
  .map((c) => ({
    name: c.name.common,
    cca2: c.cca2,
  }))
  .filter((c) => c.name && c.cca2)
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

const japan = allCountries.find((c) => c.cca2 === "JP");
const rest = allCountries.filter((c) => c.cca2 !== "JP");

/** Japan first, then A–Z — friendly default for Pagoda operators. */
export const COUNTRY_LIST: CountryOption[] = japan ? [japan, ...rest] : allCountries;

/** Open-source circle flag SVGs (Hat Scripts / lipis circle-flags). */
export function getCountryCircleFlagUrl(cca2: string): string | null {
  const code = cca2.trim().toLowerCase();
  if (!code || code === "xx" || code.length !== 2) return null;
  return `https://hatscripts.github.io/circle-flags/flags/${code}.svg`;
}

/** Rectangular flag PNG fallback (FlagCDN — free, no API key). */
export function getCountryFlagCdnUrl(cca2: string, width = 40): string | null {
  const code = cca2.trim().toLowerCase();
  if (!code || code === "xx" || code.length !== 2) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}

export function findCountryByName(name: string | null | undefined): CountryOption | undefined {
  if (!name?.trim()) return undefined;
  const n = name.trim();
  return COUNTRY_LIST.find((c) => c.name === n);
}

/** Legacy free-text values still selectable once. */
export function countryOptionForValue(value: string | null | undefined): CountryOption | null {
  const found = findCountryByName(value);
  if (found) return found;
  if (!value?.trim()) return null;
  return { name: value.trim(), cca2: "XX" };
}
