export const CONTACT_HIDDEN = '[contact hidden]'
export const PRICE_HIDDEN = '[price hidden]'

const ALREADY_MASKED = /\[(?:contact|price) hidden\]/i

type SensitivePattern = { regex: RegExp; replacement: string }

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // Email addresses
  {
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    replacement: CONTACT_HIDDEN,
  },
  // Messaging / social contact links
  {
    regex:
      /https?:\/\/(?:www\.)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|line\.me|t\.me|telegram\.me|instagram\.com|facebook\.com|fb\.me|linkedin\.com|x\.com|twitter\.com)[^\s]*/gi,
    replacement: CONTACT_HIDDEN,
  },
  {
    regex: /(?:wa\.me|line\.me|t\.me)\/[^\s]+/gi,
    replacement: CONTACT_HIDDEN,
  },
  // International phone numbers (+ country code)
  {
    regex: /(?:\+|＋)\d{1,3}[\s\-().]*\d[\d\s\-().]{6,14}\d/g,
    replacement: CONTACT_HIDDEN,
  },
  // Japanese mobile / landline (090-1234-5678, 03-1234-5678, etc.)
  {
    regex: /(?:^|[\s(（\[「'"])(?:0[5789]0|0\d{1,4})[\s\-]?\d{1,4}[\s\-]?\d{3,4}(?=[\s)）\]」'.,!?]|$)/g,
    replacement: CONTACT_HIDDEN,
  },
  // Prices with currency symbol
  {
    regex: /[¥￥$€£]\s*[\d,]+(?:\.\d{1,2})?/g,
    replacement: PRICE_HIDDEN,
  },
  // Amount + currency word (10,000 yen / 500 USD)
  {
    regex: /[\d,]+(?:\.\d{1,2})?\s*(?:yen|jpy|usd|dollars?|eur|euros?)\b/gi,
    replacement: PRICE_HIDDEN,
  },
  {
    regex: /\b(?:jpy|usd|eur)\s*[\d,]+(?:\.\d{1,2})?\b/gi,
    replacement: PRICE_HIDDEN,
  },
]

/**
 * Collapse repeated mask markers and same-line spacing, but keep newlines.
 * (Previously `\s{2,}` → single space turned `\r\n`, blank lines, and
 * "word␠⏎next" into one glued paragraph — partners who press Enter for
 * paragraphs or paste from mobile/IME often hit that path.)
 */
function collapseDuplicateMarkers(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(?:\[contact hidden\][^\S\n]*)+/gi, `${CONTACT_HIDDEN} `)
    .replace(/(?:\[price hidden\][^\S\n]*)+/gi, `${PRICE_HIDDEN} `)
    // Horizontal whitespace only (spaces/tabs) — never eat newlines
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+$/gm, "")
    .trim()
}

/** Mask personal contact details and private pricing in chat message text. */
export function maskSensitiveChatContent(text: string): string {
  if (!text) return text
  if (ALREADY_MASKED.test(text) && !/@/.test(text) && !/[¥￥$]/.test(text)) {
    return text
  }

  let result = text
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(regex, replacement)
  }

  result = collapseDuplicateMarkers(result)
  return result || CONTACT_HIDDEN
}
