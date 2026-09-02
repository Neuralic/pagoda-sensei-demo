export type UserNameSearchFields = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

/** Trim, collapse whitespace, and normalize comma separators. */
export function normalizeUserSearchQuery(raw: string): string {
  return raw.trim().replace(/,/g, " ").replace(/\s+/g, " ");
}

export function splitUserSearchTokens(query: string): string[] {
  return normalizeUserSearchQuery(query).toLowerCase().split(" ").filter(Boolean);
}

export function formatUserFullName(
  first?: string | null,
  last?: string | null
): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

function normalizedFields(user: UserNameSearchFields) {
  const first = (user.first_name ?? "").toLowerCase();
  const last = (user.last_name ?? "").toLowerCase();
  const email = (user.email ?? "").toLowerCase();
  const fullName = formatUserFullName(first, last);
  return { first, last, email, fullName };
}

/** Method 1: multi-token first/last matching (supports reversed order). */
function matchesSplitNameTokens(first: string, last: string, tokens: string[]): boolean {
  if (tokens.length < 2) return false;

  const allTokensInNameFields = tokens.every(
    (token) => first.includes(token) || last.includes(token)
  );
  if (!allTokensInNameFields) return false;

  const [head, ...tail] = tokens;
  const tailJoined = tail.join(" ");

  const forward = first.includes(head) && last.includes(tailJoined);
  const reversed = first.includes(tailJoined) && last.includes(head);

  return forward || reversed || allTokensInNameFields;
}

/**
 * Returns true when a user matches a free-text query against name and email.
 * - Single token: first name, last name, email, or concatenated full name (method 2)
 * - Multiple tokens: concatenated full name substring (method 2) or split first/last (method 1)
 */
export function userMatchesNameSearch(
  user: UserNameSearchFields,
  rawQuery: string
): boolean {
  const query = normalizeUserSearchQuery(rawQuery);
  if (!query) return true;

  const q = query.toLowerCase();
  const { first, last, email, fullName } = normalizedFields(user);

  if (first.includes(q) || last.includes(q) || email.includes(q) || fullName.includes(q)) {
    return true;
  }

  const tokens = splitUserSearchTokens(query);
  return matchesSplitNameTokens(first, last, tokens);
}
