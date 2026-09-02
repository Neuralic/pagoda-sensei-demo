import { BUCKETS } from "./buckets";
import { getSignedUrls } from "./storage-sign-client";

// Format date to readable string
export const formatDate = (dateString?: string): string => {
  if (!dateString) return ""; // handle undefined or empty input

  const date = new Date(dateString);

  if (isNaN(date.getTime())) return ""; // handle invalid date strings

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Format date range
export const formatDateRange = (startTime: string, endTime: string) => {
    const start = new Date(startTime)
    const end = new Date(endTime)

    if (start.toDateString() === end.toDateString()) {
        // Same day
        return formatDate(startTime)
    }

    return `${formatDate(startTime)} - ${formatDate(endTime)}`
}

// Calculate duration from start and end times
export  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime)
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 0) {
      return `${hours} hours ${minutes > 0 ? `${minutes} minutes` : ''}`.trim()
    }
    return `${minutes} minutes`
  }

export const calculateTimeDuration = (
  startTime?: string, 
  endTime?: string
): string => {
  if (!startTime || !endTime) return "0 minutes"; // handle undefined

  // Split HH:MM:SS safely
  const [startH = 0, startM = 0, startS = 0] = startTime.split(":").map(Number);
  const [endH = 0, endM = 0, endS = 0] = endTime.split(":").map(Number);

  // Convert times to total minutes
  const startTotal = startH * 60 + startM + startS / 60;
  const endTotal = endH * 60 + endM + endS / 60;

  // Handle next-day scenario
  let diffMinutes = endTotal - startTotal;
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = Math.round(diffMinutes % 60);

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}${
      minutes > 0 ? ` ${minutes} minute${minutes > 1 ? "s" : ""}` : ""
    }`;
  }

  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
};


/**
 * Extract HH:mm time format from various time string formats (cross-platform compatible)
 * Handles: "HH:mm", "HH:mm:ss", ISO timestamps like "2024-01-01T09:30:00Z", etc.
 */
export const extractTimeFromString = (timeString: string | undefined | null): string => {
  // Handle null, undefined, empty string, or whitespace-only strings
  if (!timeString || typeof timeString !== 'string' || timeString.trim() === '') {
    return "09:30"
  }
  
  // Trim whitespace
  const trimmed = timeString.trim()
  
  // If it's already in HH:mm format
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed
  }
  
  // If it's in HH:mm:ss or HH:mm:ss.sss format
  if (/^\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 5)
  }
  
  // If it's an ISO timestamp (e.g., "2024-01-01T09:30:00Z" or "2024-01-01T09:30:00.000Z")
  const isoMatch = trimmed.match(/T(\d{2}:\d{2}):/)
  if (isoMatch) {
    return isoMatch[1]
  }
  
  // Try to parse as Date and extract time (handles various formats)
  try {
    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      // Validate hours and minutes are valid
      const hoursNum = parseInt(hours, 10)
      const minutesNum = parseInt(minutes, 10)
      if (hoursNum >= 0 && hoursNum <= 23 && minutesNum >= 0 && minutesNum <= 59) {
        return `${hours}:${minutes}`
      }
    }
  } catch {
    // Fallback
  }
  
  return "09:30"
}

// Function to get signed URL for Supabase images
 export const getSignedImageUrl = async (imgPath: string): Promise<string> => {
    if (!imgPath || imgPath.trim() === "") {
      return "/assets/images/profile/placeholder.svg";
    }

    // If it's already a full URL (http/https), use it directly
    if (imgPath.startsWith("http")) {
      return imgPath;
    }

    // If it's an absolute path (starts with /), use it directly
    if (imgPath.startsWith("/")) {
      return imgPath;
    }

    // For Supabase storage paths (like "images/..."), get signed URL
    if (imgPath.startsWith("images/")) {
      try {
        const signedUrls = await getSignedUrls([
          { bucket: BUCKETS.tours, path: imgPath }
        ]);

        if (signedUrls.length > 0 && signedUrls[0].signedUrl) {
          return signedUrls[0].signedUrl;
        }

        // Fallback to public URL if signed URL fails
        if (signedUrls.length > 0 && signedUrls[0].publicUrl) {
          return signedUrls[0].publicUrl;
        }
      } catch (error) {
        console.error("Error getting signed URL:", error);
      }
    }

    // Fallback for any other cases
    return "/assets/images/profile/placeholder.svg";
  };