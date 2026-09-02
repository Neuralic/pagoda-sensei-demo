/**
 * Timezone-aware date formatting utilities
 * All timestamps from the database are assumed to be in UTC/ISO format
 * These functions format them according to the user's timezone
 */

/**
 * Get the user's timezone from browser or return a default
 * This should only be called on the client side
 */
export function getUserTimezone(): string {
  if (typeof window === 'undefined') {
    // Server-side: return UTC (shouldn't happen in client components)
    return 'UTC';
  }
  
  try {
    // Get timezone from browser - this is the most reliable method
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone && timeZone !== 'UTC') {
      return timeZone;
    }
    
    // Fallback: calculate timezone from offset
    const offset = -new Date().getTimezoneOffset() / 60;
    const sign = offset >= 0 ? '+' : '-';
    const hours = Math.abs(Math.floor(offset));
    const minutes = Math.abs((offset % 1) * 60);
    return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } catch (error) {
    console.error('Error detecting timezone:', error);
    // Last resort: use UTC offset
    try {
      const offset = -new Date().getTimezoneOffset() / 60;
      const sign = offset >= 0 ? '+' : '-';
      const hours = Math.abs(Math.floor(offset));
      return `UTC${sign}${String(hours).padStart(2, '0')}`;
    } catch {
      return 'UTC';
    }
  }
}

/**
 * Format a timestamp to display time (HH:MM format)
 * @param isoString - ISO timestamp string from database (UTC)
 * @param timezone - Optional timezone override, defaults to user's browser timezone
 * @param showTimezone - Whether to include timezone abbreviation (e.g., "2:30 PM EST")
 */
export function formatMessageTime(isoString: string, timezone?: string, showTimezone: boolean = false): string {
  if (!isoString) return '';
  
  try {
    // CRITICAL FIX: Ensure timestamp is treated as UTC
    // Database timestamps may not have 'Z' suffix - we must append it to force UTC parsing
    let utcString = isoString.trim();
    // Check if timestamp has timezone indicator (Z, +HH:MM, or -HH:MM)
    const hasTimezone = utcString.endsWith('Z') || 
                        /[+-]\d{2}:\d{2}$/.test(utcString) || 
                        /[+-]\d{4}$/.test(utcString);
    
    if (!hasTimezone) {
      // Timestamp is missing timezone indicator - append 'Z' to force UTC parsing
      utcString = utcString + 'Z';
    }
    
    const date = new Date(utcString);
    if (isNaN(date.getTime())) {
      console.warn('[formatMessageTime] Invalid date:', isoString, '->', utcString);
      return '';
    }
    
    // Always use provided timezone if it's valid, otherwise detect
    let tz: string;
    if (timezone && timezone !== 'UTC' && timezone.trim() !== '') {
      tz = timezone;
    } else {
      tz = getUserTimezone();
      // Log if we had to fall back to detection
      if (timezone === 'UTC' || !timezone) {
        console.log('[formatMessageTime] Timezone not provided or UTC, detected:', tz, 'for ISO:', isoString);
      }
    }
    
    // Debug log for first few calls
    if (typeof window !== 'undefined' && (window as any).__tzDebugCount === undefined) {
      (window as any).__tzDebugCount = 0;
    }
    if (typeof window !== 'undefined' && (window as any).__tzDebugCount < 3) {
      (window as any).__tzDebugCount++;
      console.log('[formatMessageTime] Call', (window as any).__tzDebugCount, '- ISO:', isoString, '| Provided TZ:', timezone, '| Using TZ:', tz);
    }
    
    const timeStr = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
      hour12: true,
    }).format(date);
    
    if (showTimezone) {
      const tzAbbr = getTimezoneAbbreviation(tz, date);
      return `${timeStr} ${tzAbbr}`;
    }
    
    return timeStr;
  } catch (error) {
    console.error('[formatMessageTime] Error formatting time:', error, 'ISO:', isoString, 'Timezone:', timezone);
    // Fallback to UTC if timezone conversion fails
    try {
      // Ensure UTC parsing in fallback too
      let fallbackString = isoString.trim();
      if (!fallbackString.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(fallbackString) && !/[+-]\d{4}$/.test(fallbackString)) {
        fallbackString = fallbackString + 'Z';
      }
      const date = new Date(fallbackString);
      const fallback = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: true,
      }).format(date);
      console.warn('[formatMessageTime] Using UTC fallback:', fallback);
      return fallback;
    } catch {
      return '';
    }
  }
}

/**
 * Get timezone abbreviation (e.g., "EST", "JST", "PST")
 * @param timezone - IANA timezone identifier
 * @param date - Date object to determine DST
 */
export function getTimezoneAbbreviation(timezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    
    const parts = formatter.formatToParts(date);
    const tzName = parts.find(part => part.type === 'timeZoneName');
    return tzName?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * Format a timestamp to display date (e.g., "January 27, 2025")
 * @param isoString - ISO timestamp string from database (UTC)
 * @param timezone - Optional timezone override, defaults to user's browser timezone
 */
export function formatMessageDate(isoString: string, timezone?: string): string {
  if (!isoString) return '';
  
  try {
    // CRITICAL FIX: Ensure timestamp is treated as UTC
    // Database timestamps may not have 'Z' suffix - we must append it to force UTC parsing
    let utcString = isoString.trim();
    // Check if timestamp has timezone indicator (Z, +HH:MM, or -HH:MM)
    const hasTimezone = utcString.endsWith('Z') || 
                        /[+-]\d{2}:\d{2}$/.test(utcString) || 
                        /[+-]\d{4}$/.test(utcString);
    
    if (!hasTimezone) {
      // Timestamp is missing timezone indicator - append 'Z' to force UTC parsing
      utcString = utcString + 'Z';
    }
    
    const date = new Date(utcString);
    if (isNaN(date.getTime())) {
      console.warn('[formatMessageDate] Invalid date:', isoString, '->', utcString);
      return '';
    }
    
    // Always use provided timezone, or detect if not provided
    const tz = timezone && timezone !== 'UTC' ? timezone : getUserTimezone();
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: tz,
    }).format(date);
  } catch (error) {
    console.error('[formatMessageDate] Error formatting date:', error, 'ISO:', isoString, 'Timezone:', timezone);
    // Fallback to UTC if timezone conversion fails
    try {
      // Ensure UTC parsing in fallback too
      let fallbackString = isoString.trim();
      if (!fallbackString.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(fallbackString) && !/[+-]\d{4}$/.test(fallbackString)) {
        fallbackString = fallbackString + 'Z';
      }
      const date = new Date(fallbackString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    } catch {
      return '';
    }
  }
}

/**
 * Format a timestamp to display date and time together
 * @param isoString - ISO timestamp string from database (UTC)
 * @param timezone - Optional timezone override, defaults to user's browser timezone
 */
export function formatMessageDateTime(isoString: string, timezone?: string): string {
  if (!isoString) return '';
  
  try {
    // CRITICAL FIX: Ensure timestamp is treated as UTC
    let utcString = isoString.trim();
    const hasTimezone = utcString.endsWith('Z') || 
                        /[+-]\d{2}:\d{2}$/.test(utcString) || 
                        /[+-]\d{4}$/.test(utcString);
    if (!hasTimezone) {
      utcString = utcString + 'Z';
    }
    
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return '';
    
    const tz = timezone || getUserTimezone();
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
      hour12: true,
    }).format(date);
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return '';
  }
}

/**
 * Get relative time (e.g., "2 hours ago", "Yesterday", "3 days ago")
 * @param isoString - ISO timestamp string from database (UTC)
 * @param timezone - Optional timezone override, defaults to user's browser timezone
 */
export function formatRelativeTime(isoString: string, timezone?: string): string {
  if (!isoString) return '';
  
  try {
    // CRITICAL FIX: Ensure timestamp is treated as UTC
    let utcString = isoString.trim();
    const hasTimezone = utcString.endsWith('Z') || 
                        /[+-]\d{2}:\d{2}$/.test(utcString) || 
                        /[+-]\d{4}$/.test(utcString);
    if (!hasTimezone) {
      utcString = utcString + 'Z';
    }
    
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSeconds < 60) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      // For older messages, show the actual date
      return formatMessageDate(isoString, timezone);
    }
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return '';
  }
}

/**
 * Check if two dates are on the same day (in user's timezone)
 * @param isoString1 - First ISO timestamp string
 * @param isoString2 - Second ISO timestamp string
 * @param timezone - Optional timezone override
 */
export function isSameDay(isoString1: string, isoString2: string, timezone?: string): boolean {
  if (!isoString1 || !isoString2) return false;
  
  try {
    const tz = timezone || getUserTimezone();
    
    // CRITICAL FIX: Ensure timestamps are treated as UTC
    const ensureUTC = (str: string) => {
      let s = str.trim();
      const hasTZ = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s);
      return hasTZ ? s : s + 'Z';
    };
    
    const date1 = new Date(ensureUTC(isoString1));
    const date2 = new Date(ensureUTC(isoString2));
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: tz,
    });
    
    return formatter.format(date1) === formatter.format(date2);
  } catch {
    return false;
  }
}

