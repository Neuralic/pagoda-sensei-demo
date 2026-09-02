/** Routes pending agents/guides may access (profile & account only). */
export function isPathAllowedWithoutFullActivity(pathname: string | null, userId: string | undefined): boolean {
  if (!pathname) return true
  const p = pathname.split('?')[0] || ''
  if (p.startsWith('/auth') || p.endsWith('/login')) return true
  if (p === '/terms') return true
  if (p === '/settings' || p.startsWith('/settings/')) return true
  if (p === '/agent/settings' || p.startsWith('/agent/settings/')) return true
  if (p === '/guide/landing') return true
  if (p === '/guide/tour-library') return true
  if (p === '/guide/guide-tour-assignments') return true
  if (p === '/guide/my-guides' || p.startsWith('/guide/my-guides/')) return true
  if (p === '/auth/guide-invite') return true
  if (p === '/profile' || p === '/agent/profile') return true
  if (p.startsWith('/profile/')) {
    const seg = decodeURIComponent(p.slice('/profile/'.length).split('/')[0] || '')
    return Boolean(userId && seg === String(userId))
  }
  return false
}
