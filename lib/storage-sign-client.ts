export type SignItem = { bucket: string; path: string; expiresIn?: number }
export type SignedResult = { bucket: string; path: string; publicUrl: string | null; signedUrl: string | null }

export async function getSignedUrls(items: SignItem[]): Promise<SignedResult[]> {
  if (!items.length) return []
  const res = await fetch('/api/storage/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || 'Failed to get signed URLs')
  }
  const data = (await res.json()) as { items: SignedResult[] }
  return data.items
}
