// Client-side OAuth helper for Google Meet integration
// Handles popup-based OAuth flow and token storage

const GOOGLE_AUTH_STORAGE_KEY = 'google_refresh_token'
const POPUP_WIDTH = 600
const POPUP_HEIGHT = 700

/**
 * Check if we have a stored refresh token
 */
export function hasGoogleToken(): boolean {
  if (typeof window === 'undefined') return false
  const token = localStorage.getItem(GOOGLE_AUTH_STORAGE_KEY)
  return !!token && token.length > 0
}

/**
 * Get stored refresh token
 */
export function getGoogleToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(GOOGLE_AUTH_STORAGE_KEY)
}

/**
 * Store refresh token
 */
export function setGoogleToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GOOGLE_AUTH_STORAGE_KEY, token)
}

/**
 * Clear stored token
 */
export function clearGoogleToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY)
}

/**
 * Open OAuth popup and return refresh token when complete
 */
export function openGoogleAuthPopup(): Promise<string> {
  return new Promise((resolve, reject) => {
    const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2
    const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2

    const popup = window.open(
      '/api/auth/google',
      'Google OAuth',
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},resizable=yes,scrollbars=yes`
    )

    if (!popup) {
      reject(new Error('Failed to open popup. Please allow popups for this site.'))
      return
    }

    // Track if we've received a success message
    let messageReceived = false
    
    // Check if we can access popup.closed (COOP may block this)
    // If blocked, we'll rely entirely on postMessage
    let canAccessPopup = true
    try {
      // Test access - if this throws, COOP is blocking
      const test = popup.closed
    } catch (e) {
      canAccessPopup = false
      // COOP is blocking - we'll rely entirely on postMessage
      // This is fine since postMessage is our primary communication method
    }
    
    // Helper function to safely check if popup is closed
    const isPopupClosed = (): boolean => {
      if (!canAccessPopup) return false // Skip check if COOP blocks access
      try {
        return popup.closed
      } catch (e) {
        canAccessPopup = false // Disable future checks if access is blocked
        return false
      }
    }
    
    // Poll for popup closure or message (only if we can access popup)
    // Note: This polling is a fallback - postMessage is the primary method
    let pollInterval: NodeJS.Timeout | null = null
    
    if (canAccessPopup) {
      // Only poll if we can access the popup
      let pollAttempts = 0
      const maxPollAttempts = 600 // 5 minutes at 500ms intervals
      pollInterval = setInterval(() => {
        pollAttempts++
        
        // Stop polling if we've received a message or exceeded max attempts
        if (messageReceived || pollAttempts > maxPollAttempts) {
          if (pollInterval) clearInterval(pollInterval)
          return
        }
        
        try {
          if (isPopupClosed()) {
            if (pollInterval) clearInterval(pollInterval)
            window.removeEventListener('message', messageHandler)
            
            // Only check for token if we haven't received a message
            // (message handler should have already resolved/rejected)
            if (!messageReceived) {
              // Give a longer delay to allow localStorage and postMessage to complete
              setTimeout(() => {
                // Check if token was stored
                const token = getGoogleToken()
                if (token) {
                  resolve(token)
                } else {
                  reject(new Error('OAuth completed but no token was received. This may happen if:\n1. You closed the popup before completing authorization\n2. The refresh token was not provided (try revoking app access in Google Account settings)\n3. There was a communication error between windows'))
                }
              }, 1000) // Longer delay to allow token storage
            }
          }
        } catch (e) {
          // Silently handle errors - postMessage will be the primary method
          // COOP errors are expected and handled gracefully
          canAccessPopup = false
          if (pollInterval) clearInterval(pollInterval)
        }
      }, 500)
    }

    // Listen for message from popup (primary method - more reliable than polling)
    const messageHandler = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        console.warn('OAuth message from unexpected origin:', event.origin)
        return
      }

      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && event.data?.refreshToken) {
        messageReceived = true
        if (pollInterval) clearInterval(pollInterval)
        window.removeEventListener('message', messageHandler)
        
        const token = event.data.refreshToken
        setGoogleToken(token)
        
        // Close popup if still open (safely handle COOP restrictions)
        try {
          if (!popup.closed) {
            popup.close()
          }
        } catch (e) {
          // COOP may block popup.close() - silently handle, user can close manually
        }
        
        resolve(token)
      } else if (event.data?.type === 'GOOGLE_AUTH_ERROR') {
        messageReceived = true
        if (pollInterval) clearInterval(pollInterval)
        window.removeEventListener('message', messageHandler)
        
        // Close popup if still open (safely handle COOP restrictions)
        try {
          if (!popup.closed) {
            popup.close()
          }
        } catch (e) {
          // COOP may block popup.close() - silently handle, user can close manually
        }
        
        reject(new Error(event.data?.error || 'OAuth failed'))
      }
    }

    window.addEventListener('message', messageHandler)

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!messageReceived) {
        if (pollInterval) clearInterval(pollInterval)
        window.removeEventListener('message', messageHandler)
        try {
          if (canAccessPopup && !isPopupClosed()) {
            popup.close()
          }
        } catch (e) {
          // COOP may block popup.close() - silently handle
        }
        reject(new Error('OAuth timed out'))
      }
    }, 5 * 60 * 1000)
  })
}

/**
 * Main function: Get refresh token (from storage or new OAuth flow)
 */
export async function getOrRequestGoogleToken(): Promise<string> {
  const existing = getGoogleToken()
  if (existing) return existing

  // No token - trigger OAuth
  return openGoogleAuthPopup()
}
