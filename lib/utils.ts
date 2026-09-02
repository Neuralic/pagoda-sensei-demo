import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safari-compatible date parser
 * Safari requires ISO 8601 format with timezone information
 * This function normalizes date strings to ensure Safari compatibility
 */
export function parseSafariDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  try {
    // If already a valid ISO string with timezone, use it directly
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // If it's in format "YYYY-MM-DDTHH:mm:ss" (without timezone), add UTC timezone
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateString)) {
      const date = new Date(dateString + 'Z');
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // If it's in format "YYYY-MM-DD" (date only), treat as UTC midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const date = new Date(dateString + 'T00:00:00Z');
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // Try parsing as-is (fallback)
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Safely format a date string for display (Safari-compatible)
 */
export function formatDate(dateString: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const date = parseSafariDate(dateString);
  if (!date) return '—';
  
  try {
    return date.toLocaleDateString('en-US', options);
  } catch {
    return '—';
  }
}

/**
 * Safely format a date and time string for display (Safari-compatible)
 */
export function formatDateTime(dateString: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const date = parseSafariDate(dateString);
  if (!date) return '—';
  
  try {
    return date.toLocaleString('en-US', options);
  } catch {
    return '—';
  }
}

/**
 * Safely format a time string for display (Safari-compatible)
 */
export function formatTime(dateString: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const date = parseSafariDate(dateString);
  if (!date) return '—';
  
  try {
    return date.toLocaleTimeString('en-US', options);
  } catch {
    return '—';
  }
}

/**
 * Create a Date object from date and time strings (Safari-compatible)
 * Assumes UTC timezone if not specified
 */
export function createDateFromStrings(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  
  try {
    // Ensure time format is HH:mm
    const normalizedTime = timeStr.length === 5 ? timeStr : timeStr.padStart(5, '0');
    // Create ISO string with UTC timezone for Safari compatibility
    const isoString = `${dateStr}T${normalizedTime}:00Z`;
    const date = new Date(isoString);
    
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    return null;
  } catch {
    return null;
  }
}