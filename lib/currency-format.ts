/** Parse user input to a numeric string (digits only for JPY; digits + one decimal for others). */
export function sanitizeDailyRateInput(raw: string, currency: string): string {
  const c = currency.toUpperCase();
  if (c === "JPY") {
    return raw.replace(/\D/g, "");
  }
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

/** Display daily rate using Japanese grouping (e.g. 50000 → 50,000). */
export function formatDailyRateDisplay(amount: string, currency: string): string {
  const sanitized = sanitizeDailyRateInput(amount, currency);
  if (!sanitized) return "";

  const n = currency.toUpperCase() === "JPY" ? parseInt(sanitized, 10) : parseFloat(sanitized);
  if (!Number.isFinite(n)) return "";

  const maxFrac = currency.toUpperCase() === "JPY" ? 0 : 2;
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: 0,
  }).format(n);
}

export function parseDailyRateNumber(amount: string, currency: string): number | null {
  const sanitized = sanitizeDailyRateInput(amount, currency);
  if (!sanitized) return null;
  const n = currency.toUpperCase() === "JPY" ? parseInt(sanitized, 10) : parseFloat(sanitized);
  return Number.isFinite(n) ? n : null;
}

/** Formatted amount with ¥ prefix when JPY (for hints / summaries). */
export function formatDailyRateLabel(
  amount: number,
  currency: string
): string {
  const c = currency.toUpperCase();
  if (c === "JPY") {
    return `¥${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(Math.round(amount))}`;
  }
  return `${c} ${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(amount)}`;
}
