// "use client";

// import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
// import { X, MapPin, Clock, Users, DollarSign, Globe, Calendar } from "lucide-react";
// import { Badge } from "@/components/ui/badge";
// import ReactCountryFlag from "react-country-flag";
// import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map";
// import Image from "next/image";
// import { useState, useEffect } from "react";
// import { getSignedUrls } from "@/lib/storage-sign-client";
// import { BUCKETS } from "@/lib/buckets";

// interface Activity {
//   title: string;
//   duration: string;
//   location: string;
//   image: string;
//   description: string;
// }

// interface JobDetailModalProps {
//   isOpen: boolean;
//   onClose: () => void;
//   title: string;
//   location: string;
//   duration: string;
//   highlights: string;
//   activities: Activity[];
//   // New props for additional details
//   jobDetails?: {
//     agent?: {
//       name: string;
//       user?: {
//         firstName: string;
//         lastName: string;
//         email: string;
//       };
//       profile?: {
//         avatarUrl: string;
//       };
//     };
//     priceRange?: string;
//     groupSize?: number;
//     languages?: string[];
//     images?: string[];
//     startTime?: string;
//     endTime?: string;
//     activityType?: string;
//     minPrice?: number;
//     maxPrice?: number;
//   };
// }

// // Different fallback images for users vs jobs
// const USER_FALLBACK_IMAGE = "/assets/images/profile/avatar.png";
// const JOB_FALLBACK_IMAGE = "/assets/images/profile/placeholder.svg";

// export function JobDetailModal({
//   isOpen,
//   onClose,
//   title,
//   location,
//   duration,
//   highlights,
//   activities,
//   jobDetails,
// }: JobDetailModalProps) {
//   console.log("Job details: ", jobDetails);

//   const [userImageUrls, setUserImageUrls] = useState<Record<string, string>>({});
//   const [jobImageUrls, setJobImageUrls] = useState<Record<string, string>>({});
//   const [loading, setLoading] = useState(true);

//   // Function to get language country code
//   const getLanguageCountryCode = (name: string): string | undefined => {
//     const key = name.trim().toLowerCase();
//     return LANGUAGE_FLAG_MAP[key];
//   };

//   // Load all signed URLs when modal opens
//   useEffect(() => {
//     if (!isOpen) return;

//     const loadSignedUrls = async () => {
//       setLoading(true);
//       try {
//         const allImagePaths: { path: string; type: 'user' | 'job' }[] = [];

//         // Collect user avatar paths
//         if (jobDetails?.agent?.profile?.avatarUrl) {
//           allImagePaths.push({
//             path: jobDetails.agent.profile.avatarUrl,
//             type: 'user'
//           });
//         }

//         // Collect job image paths
//         if (jobDetails?.images && jobDetails.images.length > 0) {
//           jobDetails.images.forEach(image => {
//             allImagePaths.push({ path: image, type: 'job' });
//           });
//         }

//         // Collect activity image paths
//         activities.forEach(activity => {
//           if (activity.image) {
//             allImagePaths.push({ path: activity.image, type: 'job' });
//           }
//         });

//         // Filter out non-Supabase images
//         const supabaseImagePaths = allImagePaths.filter(item => 
//           !item.path.startsWith('http') && !item.path.startsWith('/')
//         );

//         if (supabaseImagePaths.length > 0) {
//           const signedUrls = await getSignedUrls(
//             supabaseImagePaths.map(item => ({
//               bucket: item.type === 'user' ? BUCKETS.avatars : BUCKETS.jobs,
//               path: item.path
//             }))
//           );

//           const userUrls: Record<string, string> = {};
//           const jobUrls: Record<string, string> = {};

//           signedUrls.forEach((result, index) => {
//             const originalItem = supabaseImagePaths[index];
//             const url = result.signedUrl || result.publicUrl;
//             if (url && originalItem.path) {
//               if (originalItem.type === 'user') {
//                 userUrls[originalItem.path] = url;
//               } else {
//                 jobUrls[originalItem.path] = url;
//               }
//             }
//           });

//           setUserImageUrls(userUrls);
//           setJobImageUrls(jobUrls);
//         }
//       } catch (error) {
//         console.error("Error loading signed URLs:", error);
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadSignedUrls();
//   }, [isOpen, jobDetails, activities]);

//   // Function to get safe user avatar URL
//   const getSafeUserImageUrl = (url: string | undefined | null): string => {
//     if (!url) return USER_FALLBACK_IMAGE;

//     // If it's already a full URL, use it
//     if (url.startsWith("http")) return url;

//     // If it's a public asset path, use it directly
//     if (url.startsWith("/")) return url;

//     // Check if we have a signed URL for this user image
//     if (userImageUrls[url]) return userImageUrls[url];

//     // Fallback: construct public URL for Supabase
//     const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
//     if (supabaseUrl) {
//       return `${supabaseUrl}/storage/v1/object/public/avatars/${url}`;
//     }

//     return USER_FALLBACK_IMAGE;
//   };

//   // Function to get safe job/image URL
//   const getSafeJobImageUrl = (url: string | undefined | null): string => {
//     if (!url) return JOB_FALLBACK_IMAGE;

//     // If it's already a full URL, use it
//     if (url.startsWith("http")) return url;

//     // If it's a public asset path, use it directly
//     if (url.startsWith("/")) return url;

//     // Check if we have a signed URL for this job image
//     if (jobImageUrls[url]) return jobImageUrls[url];

//     // Fallback: construct public URL for Supabase
//     const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
//     if (supabaseUrl) {
//       return `${supabaseUrl}/storage/v1/object/public/images/${url}`;
//     }

//     return JOB_FALLBACK_IMAGE;
//   };

//   const formatTime = (dateString: string) => {
//     if (!dateString) return "N/A";
//     try {
//       return new Date(dateString).toLocaleTimeString("en-US", {
//         hour: "numeric",
//         minute: "2-digit",
//         hour12: true,
//       });
//     } catch (e) {
//       return "Invalid time";
//     }
//   };

//   const formatFullDate = (dateString: string) => {
//     if (!dateString) return "N/A";
//     try {
//       return new Date(dateString).toLocaleDateString("en-US", {
//         weekday: "long",
//         year: "numeric",
//         month: "long",
//         day: "numeric",
//       });
//     } catch (e) {
//       return "Invalid date";
//     }
//   };

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose}>
//       <DialogContent
//         className="max-w-3xl max-h-[90vh] overflow-y-auto p-6
//   [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]"
//       >
//         {/* Header */}
//         <div className="flex items-start justify-between mb-6">
//           <div className="flex-1">
//             <div className="flex items-start justify-between">
//               <div>
//                 <h2 className="text-2xl font-bold">{title}</h2>
//                 {jobDetails?.activityType && (
//                   <Badge variant="secondary" className="mt-2">
//                     {jobDetails.activityType}
//                   </Badge>
//                 )}
//               </div>
//               <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 disabled:pointer-events-none ml-4 cursor-pointer">
//                 <X className="h-8 w-8" />
//                 <span className="sr-only">Close</span>
//               </DialogClose>
//             </div>

//             {/* Agency Info */}
//             {jobDetails?.agent && (
//               <div className="flex items-center gap-2 mt-3">
//                 <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 relative">
//                   <Image
//                     src={getSafeUserImageUrl(jobDetails.agent.profile?.avatarUrl)}
//                     alt={jobDetails.agent.name}
//                     fill
//                     className="object-cover"
//                     onError={(e) => {
//                       // This won't work with Next.js Image, but we handle it in src
//                     }}
//                   />
//                 </div>
//                 <div>
//                   <p className="text-sm font-medium">
//                     Hosted by {jobDetails.agent.name}
//                   </p>
//                   {jobDetails.agent.user?.email && (
//                     <p className="text-xs text-muted-foreground">
//                       {jobDetails.agent.user.email}
//                     </p>
//                   )}
//                 </div>
//               </div>
//             )}

//             {/* Key Details */}
//             <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
//               <div className="flex items-center gap-1">
//                 <MapPin className="w-4 h-4" />
//                 {location}
//               </div>
//               <div className="flex items-center gap-1">
//                 <Clock className="w-4 h-4" />
//                 {duration}
//               </div>
//               {jobDetails?.groupSize && (
//                 <div className="flex items-center gap-1">
//                   <Users className="w-4 h-4" />
//                   Up to {jobDetails.groupSize} people
//                 </div>
//               )}
//             </div>

//             {/* Date and Time */}
//             {jobDetails?.startTime && (
//               <div className="mt-2 text-sm">
//                 <p className="font-medium flex items-center gap-1">
//                   <Calendar className="w-4 h-4" />
//                   Schedule:
//                 </p>
//                 <p>
//                   {formatFullDate(jobDetails.startTime)} •{" "}
//                   {formatTime(jobDetails.startTime)} -{" "}
//                   {formatTime(jobDetails.endTime || "")}
//                 </p>
//               </div>
//             )}
//           </div>
//         </div>

//         {/* Languages with Flags */}
//         {jobDetails?.languages && jobDetails.languages.length > 0 && (
//           <div className="mb-6">
//             <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
//               <Globe className="w-4 h-4" />
//               Languages Spoken
//             </h3>
//             <div className="flex flex-wrap gap-2">
//               {jobDetails.languages.map((lang, index) => {
//                 const countryCode = getLanguageCountryCode(lang);
//                 return (
//                   <Badge key={index} variant="outline" className="flex items-center gap-1">
//                     {countryCode && (
//                       <ReactCountryFlag
//                         countryCode={countryCode}
//                         svg
//                         style={{ width: "12px", height: "12px" }}
//                         title={lang}
//                       />
//                     )}
//                     {lang}
//                   </Badge>
//                 );
//               })}
//             </div>
//           </div>
//         )}

//         {/* Highlights Section */}
//         <div className="mb-6">
//           <h3 className="font-semibold text-base mb-2">
//             Experience Description
//           </h3>
//           <p className="text-sm text-foreground leading-relaxed">
//             {highlights}
//           </p>
//         </div>

//         {/* Additional Images */}
//         {jobDetails?.images && jobDetails.images.length > 0 && (
//           <div className="mb-6">
//             <h3 className="font-semibold text-base mb-2">Gallery</h3>
//             <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
//               {jobDetails.images.map((image, index) => (
//                 <div
//                   key={index}
//                   className="relative h-24 rounded-lg overflow-hidden"
//                 >
//                   <Image
//                     src={getSafeJobImageUrl(image)}
//                     alt={`${title} image ${index + 1}`}
//                     fill
//                     className="object-cover"
//                     onError={(e) => {
//                       // This won't work with Next.js Image, but we handle it in src
//                     }}
//                   />
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}

//         {/* Activities Section */}
//         {activities && activities.length > 0 && (
//           <div className="space-y-6">
//             <h3 className="font-semibold text-base">Activity Details</h3>
//             {activities.map((activity, index) => (
//               <div key={index} className="border-t pt-4">
//                 {/* Activity Header */}
//                 <div className="flex items-start gap-3 mb-3">
//                   <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">
//                     {index + 1}
//                   </div>
//                   <div className="flex-1">
//                     <h4 className="font-semibold text-base">
//                       {activity.title}
//                     </h4>
//                     <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
//                       <div className="flex items-center gap-1">
//                         <Clock className="w-3 h-3" />
//                         {activity.duration}
//                       </div>
//                       <div className="flex items-center gap-1">
//                         <MapPin className="w-3 h-3" />
//                         {activity.location}
//                       </div>
//                     </div>
//                   </div>
//                 </div>

//                 {/* Activity Image */}
//                 {activity.image && (
//                   <div className="relative h-48 w-full overflow-hidden rounded-lg mb-3 bg-muted">
//                     <Image
//                       src={getSafeJobImageUrl(activity.image)}
//                       alt={activity.title}
//                       fill
//                       className="object-cover"
//                       onError={(e) => {
//                         // This won't work with Next.js Image, but we handle it in src
//                       }}
//                     />
//                   </div>
//                 )}

//                 {/* Activity Description */}
//                 <p className="text-sm text-foreground leading-relaxed">
//                   {activity.description}
//                 </p>
//               </div>
//             ))}
//           </div>
//         )}

//         {/* Loading State */}
//         {loading && (
//           <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
//             <div className="text-lg">Loading images...</div>
//           </div>
//         )}
//       </DialogContent>
//     </Dialog>
//   );
// }




"use client";

import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { X, MapPin, Clock, Users, DollarSign, Globe, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ReactCountryFlag from "react-country-flag";
import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map";
import Image from "next/image";
import { useState, useEffect } from "react";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { formatTime as formatTimeUtil, formatDate } from "@/lib/utils";
import countries from "world-countries";
interface Activity {
  title: string;
  duration: string;
  location: string;
  image: string;
  description: string;
}

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  location: string;
  duration: string;
  highlights: string;
  activities: Activity[];
  // New props for additional details
  jobDetails?: {
    agent?: {
      id: string;
      name: string;
      user?: {
        id?: string;
        firstName: string;
        lastName: string;
        email: string;
      } | null;
      profile?: {
        id?: string;
        userId?: string;
        avatarPath?: string;
        avatarUrl: string | null;
      } | null;
    };
    priceRange?: string;
    groupSize?: number;
    languages?: string[];
    images?: string[];
    startTime?: string;
    endTime?: string;
    activityType?: string;
    minPrice?: number;
    maxPrice?: number;
  };
}

// Different fallback images for users vs jobs
const USER_FALLBACK_IMAGE = "/assets/images/profile/avatar.png";
const JOB_FALLBACK_IMAGE = "/assets/images/profile/placeholder.svg";

// Build a map of language codes to full names
const LANGUAGE_CODE_TO_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const countriesList = countries as { languages?: Record<string, string> }[];
  countriesList.forEach((c) => {
    if (c.languages && typeof c.languages === "object") {
      Object.entries(c.languages).forEach(([code, name]) => {
        if (!map[code]) map[code] = String(name);
      });
    }
  });
  return map;
})();

// Convert language code or name to full language name
const getLanguageName = (lang: string): string => {
  const trimmed = lang.trim();
  // If it's already a full name (capitalized), return as is
  if (trimmed[0] === trimmed[0].toUpperCase() && trimmed.length > 3) {
    return trimmed;
  }
  // Try to find by code (lowercase 2-3 letter codes like "eng", "jpn", "sqi", "amh")
  const lower = trimmed.toLowerCase();
  if (LANGUAGE_CODE_TO_NAME[lower]) {
    return LANGUAGE_CODE_TO_NAME[lower];
  }
  // Try to find by name in the map (for lowercase names like "english")
  if (LANGUAGE_FLAG_MAP[lower]) {
    // Capitalize first letter
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
  // Fallback: capitalize first letter
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

export function JobDetailModal({
  isOpen,
  onClose,
  title,
  location,
  duration,
  highlights,
  activities,
  jobDetails,
}: JobDetailModalProps) {

  const [avatarUrl, setAvatarUrl] = useState<string>(USER_FALLBACK_IMAGE);
  const [jobImageUrls, setJobImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Function to get language country code - tries both the original value and converted name
  const getLanguageCountryCode = (originalLang: string, convertedName: string): string | undefined => {
    const originalKey = originalLang.trim().toLowerCase();
    const nameKey = convertedName.trim().toLowerCase();
    // Try original value first (might be a code like "sqi", "amh")
    if (LANGUAGE_FLAG_MAP[originalKey]) {
      return LANGUAGE_FLAG_MAP[originalKey];
    }
    // Try converted name (like "albanian", "amharic")
    if (LANGUAGE_FLAG_MAP[nameKey]) {
      return LANGUAGE_FLAG_MAP[nameKey];
    }
    return undefined;
  };

  // Load avatar URL when modal opens or jobDetails changes
  useEffect(() => {
    if (!isOpen) {
      setAvatarUrl(USER_FALLBACK_IMAGE);
      return;
    }

    let cancelled = false;

    const loadAvatarUrl = async () => {
      try {
        // First, try to use the avatarUrl from the API response
        const apiAvatarUrl = jobDetails?.agent?.profile?.avatarUrl;
        
        if (apiAvatarUrl) {
          if (!cancelled) {
            setAvatarUrl(apiAvatarUrl);
          }
          return;
        }

        // If no avatarUrl from API, try to get signed URL from avatarPath
        const avatarPath = jobDetails?.agent?.profile?.avatarPath;
        
        if (avatarPath) {
          // For Supabase storage paths, get signed URL
          const signedUrls = await getSignedUrls([
            { bucket: BUCKETS.avatars, path: avatarPath }
          ]);

          if (!cancelled && signedUrls.length > 0) {
            const url = signedUrls[0]?.signedUrl || signedUrls[0]?.publicUrl;
            if (url) {
              setAvatarUrl(url);
              return;
            }
          }
        }

        // Fallback to default avatar
        if (!cancelled) {
          setAvatarUrl(USER_FALLBACK_IMAGE);
        }
      } catch (error) {
        console.error("Error loading avatar URL:", error);
        if (!cancelled) {
          setAvatarUrl(USER_FALLBACK_IMAGE);
        }
      }
    };

    loadAvatarUrl();

    return () => {
      cancelled = true;
    };
  }, [isOpen, jobDetails?.agent?.profile?.avatarUrl, jobDetails?.agent?.profile?.avatarPath]);

  // Load job image URLs
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadJobImageUrls = async () => {
      setLoading(true);
      try {
        const allJobImagePaths: string[] = [];

        // Collect job image paths
        if (jobDetails?.images && jobDetails.images.length > 0) {
          jobDetails.images.forEach(image => {
            if (image && !image.startsWith("http") && !image.startsWith("/")) {
              allJobImagePaths.push(image);
            }
          });
        }

        // Collect activity image paths
        activities.forEach(activity => {
          if (activity.image && !activity.image.startsWith("http") && !activity.image.startsWith("/")) {
            allJobImagePaths.push(activity.image);
          }
        });

        if (allJobImagePaths.length > 0) {
          const signedUrls = await getSignedUrls(
            allJobImagePaths.map(path => ({
              bucket: BUCKETS.jobs,
              path: path
            }))
          );

          if (!cancelled) {
            const jobUrls: Record<string, string> = {};
            
            signedUrls.forEach((result, index) => {
              const originalPath = allJobImagePaths[index];
              const url = result.signedUrl || result.publicUrl;
              if (url && originalPath) {
                jobUrls[originalPath] = url;
              }
            });

            setJobImageUrls(jobUrls);
          }
        }
      } catch (error) {
        console.error("Error loading job image URLs:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadJobImageUrls();

    return () => {
      cancelled = true;
    };
  }, [isOpen, jobDetails?.images, activities]);

  // Function to get safe job/image URL
  const getSafeJobImageUrl = (url: string | undefined | null): string => {
    if (!url) return JOB_FALLBACK_IMAGE;

    // If it's already a full URL, use it
    if (url.startsWith("http")) return url;

    // If it's a public asset path, use it directly
    if (url.startsWith("/")) return url;

    // Check if we have a signed URL for this job image
    if (jobImageUrls[url]) return jobImageUrls[url];

    // Fallback: construct public URL for Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      return `${supabaseUrl}/storage/v1/object/public/images/${url}`;
    }

    return JOB_FALLBACK_IMAGE;
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return "N/A";
    return formatTimeUtil(dateString, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatFullDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return formatDate(dateString, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent  className="max-w-3xl max-h-[90vh] overflow-y-auto p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold">{title}</h2>
                {jobDetails?.activityType && (
                  <Badge variant="secondary" className="mt-2">
                    {jobDetails.activityType}
                  </Badge>
                )}
              </div>
              <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 disabled:pointer-events-none ml-4 cursor-pointer">
                <X className="h-8 w-8" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>

            {/* Agency Info */}
            {jobDetails?.agent && (
              <div className="flex items-center gap-2 mt-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 relative">
                  <Image
                    src={avatarUrl}
                    alt={jobDetails.agent.name}
                    fill
                    className="object-cover"
                    onError={() => {
                      // Fallback to default avatar if image fails to load
                      setAvatarUrl(USER_FALLBACK_IMAGE);
                    }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Hosted by {jobDetails.agent.name}
                  </p>
                </div>
              </div>
            )}

            {/* Key Details */}
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {location}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {duration}
              </div>
              {jobDetails?.groupSize && (
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  Up to {jobDetails.groupSize} people
                </div>
              )}
              {(jobDetails?.minPrice || jobDetails?.maxPrice) && (
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  {jobDetails.priceRange || 
                    (jobDetails.minPrice && jobDetails.maxPrice ? 
                      `$${jobDetails.minPrice} - $${jobDetails.maxPrice}` : 
                      jobDetails.minPrice ? `From $${jobDetails.minPrice}` : 
                      jobDetails.maxPrice ? `Up to $${jobDetails.maxPrice}` : 'Free'
                    )
                  }
                </div>
              )}
            </div>

            {/* Date and Time */}
            {jobDetails?.startTime && (
              <div className="mt-2 text-sm">
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Schedule:
                </p>
                <p>
                  {formatFullDate(jobDetails.startTime)} •{" "}
                  {formatTime(jobDetails.startTime)} -{" "}
                  {formatTime(jobDetails.endTime || "")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Languages with Flags */}
        {jobDetails?.languages && jobDetails.languages.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Languages Spoken
            </h3>
            <div className="flex flex-wrap gap-2">
              {jobDetails.languages.map((lang, index) => {
                const languageName = getLanguageName(lang);
                const countryCode = getLanguageCountryCode(lang, languageName);
                return (
                  <Badge key={index} variant="outline" className="flex items-center gap-1">
                    {countryCode && (
                      <ReactCountryFlag
                        countryCode={countryCode}
                        svg
                        style={{ width: "12px", height: "12px" }}
                        title={languageName}
                      />
                    )}
                    {languageName}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Highlights Section */}
        <div className="mb-6">
          <h3 className="font-semibold text-base mb-3">
            Job description
          </h3>
          <div className="prose prose-sm max-w-none">
            {highlights ? (
              highlights.split('\n').map((paragraph, index) => (
                paragraph.trim() ? (
                  <p key={index} className="text-sm text-foreground leading-relaxed mb-3 last:mb-0 whitespace-pre-line">
                    {paragraph.trim()}
          </p>
                ) : null
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided.</p>
            )}
          </div>
        </div>

        {/* Additional Images */}
        {jobDetails?.images && jobDetails.images.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-base mb-2">Gallery</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {jobDetails.images.map((image, index) => (
                <div
                  key={index}
                  className="relative h-24 rounded-lg overflow-hidden"
                >
                  <Image
                    src={getSafeJobImageUrl(image)}
                    alt={`${title} image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activities Section */}
        {/* {activities && activities.length > 0 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-base">Activity Details</h3>
            {activities.map((activity, index) => (
              <div key={index} className="border-t pt-4">

                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-base">
                      {activity.title}
                    </h4>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {activity.duration}
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {activity.location}
                      </div>
                    </div>
                  </div>
                </div>

                {activity.image && (
                  <div className="relative h-48 w-full overflow-hidden rounded-lg mb-3 bg-muted">
                    <Image
                      src={getSafeJobImageUrl(activity.image)}
                      alt={activity.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}

                <p className="text-sm text-foreground leading-relaxed">
                  {activity.description}
                </p>
              </div>
            ))}
          </div>
        )} */}

        {/* Loading State */}
        {loading && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-lg">Loading images...</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}