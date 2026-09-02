/** IATA hubs commonly used with Pagoda / Japan itineraries (Transferz accepts any valid IATA). */
export const TRANSFERZ_IATA_OPTIONS: { code: string; label: string }[] = [
  { code: "NRT", label: "Tokyo — Narita (NRT)" },
  { code: "HND", label: "Tokyo — Haneda (HND)" },
  { code: "KIX", label: "Osaka — Kansai (KIX)" },
  { code: "ITM", label: "Osaka — Itami (ITM)" },
  { code: "NGO", label: "Nagoya — Chubu Centrair (NGO)" },
  { code: "CTS", label: "Sapporo — New Chitose (CTS)" },
  { code: "FUK", label: "Fukuoka (FUK)" },
  { code: "OKA", label: "Naha — Okinawa (OKA)" },
  { code: "KOJ", label: "Kagoshima (KOJ)" },
  { code: "KMJ", label: "Kumamoto (KMJ)" },
  { code: "HIJ", label: "Hiroshima (HIJ)" },
  { code: "SDJ", label: "Sendai (SDJ)" },
  { code: "AOJ", label: "Aomori (AOJ)" },
  { code: "KIJ", label: "Niigata (KIJ)" },
  { code: "KMQ", label: "Komatsu (KMQ)" },
  { code: "FSZ", label: "Mt. Fuji — Shizuoka (FSZ)" },
  { code: "IBR", label: "Ibaraki (IBR)" },
  { code: "UKB", label: "Kobe — Kobe Airport (UKB)" },
  { code: "SHM", label: "Shirahama (SHM)" },
  { code: "TKS", label: "Tokushima (TKS)" },
  { code: "TAK", label: "Takamatsu (TAK)" },
  { code: "MYJ", label: "Matsuyama (MYJ)" },
  { code: "KCZ", label: "Kochi (KCZ)" },
  { code: "ICN", label: "Seoul — Incheon (ICN)" },
  { code: "GMP", label: "Seoul — Gimpo (GMP)" },
  { code: "PUS", label: "Busan (PUS)" },
  { code: "TPE", label: "Taipei — Taoyuan (TPE)" },
  { code: "HKG", label: "Hong Kong (HKG)" },
  { code: "SIN", label: "Singapore (SIN)" },
  { code: "BKK", label: "Bangkok Suvarnabhumi (BKK)" },
  { code: "AMS", label: "Amsterdam Schiphol (AMS)" },
  { code: "CDG", label: "Paris Charles de Gaulle (CDG)" },
  { code: "LHR", label: "London Heathrow (LHR)" },
  { code: "LAX", label: "Los Angeles (LAX)" },
  { code: "SFO", label: "San Francisco (SFO)" },
  { code: "JFK", label: "New York JFK (JFK)" },
].sort((a, b) => a.label.localeCompare(b.label));

export type TransferzAddressPreset = {
  id: string;
  label: string;
  phrase: string;
  countryCode: string;
};

export const TRANSFERZ_ADDRESS_PRESET_CUSTOM = "custom";

export const TRANSFERZ_ADDRESS_PRESETS: TransferzAddressPreset[] = [
  {
    id: "tokyo-st",
    label: "Tokyo — Tokyo Station",
    phrase: "Tokyo Station, Chiyoda City, Tokyo",
    countryCode: "JP",
  },
  {
    id: "shinjuku",
    label: "Tokyo — Shinjuku Station",
    phrase: "Shinjuku Station, Shinjuku City, Tokyo",
    countryCode: "JP",
  },
  {
    id: "shibuya",
    label: "Tokyo — Shibuya Station",
    phrase: "Shibuya Station, Shibuya City, Tokyo",
    countryCode: "JP",
  },
  {
    id: "ginza",
    label: "Tokyo — Ginza",
    phrase: "Ginza, Chuo City, Tokyo",
    countryCode: "JP",
  },
  {
    id: "ueno",
    label: "Tokyo — Ueno",
    phrase: "Ueno Station, Taito City, Tokyo",
    countryCode: "JP",
  },
  {
    id: "yokohama",
    label: "Yokohama — Yokohama Station",
    phrase: "Yokohama Station, Nishi Ward, Yokohama",
    countryCode: "JP",
  },
  {
    id: "kyoto-st",
    label: "Kyoto — Kyoto Station",
    phrase: "Kyoto Station, Shimogyo Ward, Kyoto",
    countryCode: "JP",
  },
  {
    id: "gion",
    label: "Kyoto — Gion area",
    phrase: "Gion, Higashiyama Ward, Kyoto",
    countryCode: "JP",
  },
  {
    id: "osaka-umeda",
    label: "Osaka — Umeda / Osaka Station",
    phrase: "Osaka Station, Umeda, Kita Ward, Osaka",
    countryCode: "JP",
  },
  {
    id: "osaka-namba",
    label: "Osaka — Namba",
    phrase: "Namba, Chuo Ward, Osaka",
    countryCode: "JP",
  },
  {
    id: "nagoya-st",
    label: "Nagoya — Nagoya Station",
    phrase: "Nagoya Station, Nakamura Ward, Nagoya",
    countryCode: "JP",
  },
  {
    id: "hiroshima-st",
    label: "Hiroshima — Hiroshima Station",
    phrase: "Hiroshima Station, Minami Ward, Hiroshima",
    countryCode: "JP",
  },
  {
    id: "hakone",
    label: "Hakone — Hakone-Yumoto area",
    phrase: "Hakone-Yumoto Station, Hakone, Ashigarashimo District",
    countryCode: "JP",
  },
  {
    id: TRANSFERZ_ADDRESS_PRESET_CUSTOM,
    label: "Other — type address below",
    phrase: "",
    countryCode: "JP",
  },
];

export const TRANSFERZ_COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: "JP", label: "Japan (JP)" },
  { code: "KR", label: "South Korea (KR)" },
  { code: "TW", label: "Taiwan (TW)" },
  { code: "SG", label: "Singapore (SG)" },
  { code: "TH", label: "Thailand (TH)" },
  { code: "US", label: "United States (US)" },
  { code: "GB", label: "United Kingdom (GB)" },
  { code: "NL", label: "Netherlands (NL)" },
  { code: "FR", label: "France (FR)" },
  { code: "DE", label: "Germany (DE)" },
  { code: "AU", label: "Australia (AU)" },
];
