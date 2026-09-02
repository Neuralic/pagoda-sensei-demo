// "use client";

// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Card } from "@/components/ui/card";
// import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map";
// import { Calendar, MapPin, Clock, Users, MapPinned } from "lucide-react";
// import Image from "next/image";
// import ReactCountryFlag from "react-country-flag";

// interface JobCardProps {
//   id: string;
//   image: string;
//   title: string;
//   location: string;
//   duration: string;
//   people: number;
//   stops: number;
//   dateRange: string;
//   highlights: string;
//   languages: string[];
//   postedDate: string;
//   count?: number;
//   onView: () => void;
//   // New props from API
//   agencyName?: string;
//   priceRange?: string;
//   activityType?: string;
//   minPrice?: number;
//   maxPrice?: number;
// }

// export function JobCard({
//   image,
//   title,
//   location,
//   duration,
//   people,
//   stops,
//   dateRange,
//   highlights,
//   languages,
//   postedDate,
//   count,
//   onView,
//   agencyName,
//   priceRange,
//   activityType,
//   minPrice,
//   maxPrice,
// }: JobCardProps) {
//   console.log("Image: ", image);

//   const getLanguageCountryCode = (name: string): string | undefined => {
//     const key = name.trim().toLowerCase();
//     return LANGUAGE_FLAG_MAP[key];
//   };

//   // Function to get safe image URL
//   const getSafeImageUrl = (imgPath: string): string => {
//     if (!imgPath) {
//       return "/assets/images/profile/placeholder.svg";
//     }

//     // If it's already a full URL, use it
//     if (imgPath.startsWith("http")) {
//       return imgPath;
//     }

//     // If it's a public asset path, use it directly
//     if (imgPath.startsWith("/")) {
//       return imgPath;
//     }

//     // For Supabase storage paths, you need to construct the full URL
//     // Replace this with your actual Supabase URL and bucket name
//     if (imgPath.startsWith("images/")) {
//       // You'll need to get this from your Supabase config
//       const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
//       const bucketName = "your-bucket-name"; // Replace with your actual bucket name

//       if (supabaseUrl) {
//         return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${imgPath}`;
//       }

//       // Fallback: try to serve from public folder (won't work for Supabase paths)
//       return "/assets/images/profile/placeholder.svg";
//     }

//     return "/assets/images/profile/placeholder.svg";
//   };

//   // Function to check if image is from Supabase storage
//   const isSupabaseImage = (imgPath: string): boolean => {
//     return imgPath?.startsWith("images/");
//   };

//   // For Supabase images, we need to use a regular img tag or configure Next.js image domains
//   const SafeImage = () => {
//     const imageUrl = getSafeImageUrl(image);
//     const isExternal = imageUrl.startsWith("http");

//     if (isExternal || isSupabaseImage(image)) {
//       // Use regular img tag for external/Supabase images until we configure Next.js
//       return (
//         <img
//           src={imageUrl}
//           alt={title}
//           className="w-full h-full object-cover"
//           onError={(e) => {
//             const target = e.target as HTMLImageElement;
//             target.src = "/assets/images/profile/placeholder.svg";
//           }}
//         />
//       );
//     }

//     // Use Next.js Image for local images
//     return (
//       <Image
//         src={imageUrl}
//         alt={title}
//         fill
//         className="object-cover"
//         onError={(e) => {
//           // This won't work with Next.js Image, but we'll handle it in the src
//         }}
//       />
//     );
//   };

//   return (
//     <Card className="overflow-hidden shadow-lg transition-shadow flex flex-col h-full rounded-xl">
//       {/* Image Section with Overlay Content */}
//       <div className="relative h-54 w-full overflow-hidden bg-muted rounded-md">
//         <SafeImage />

//         {/* Gradient Overlay for Text Readability */}
//         <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

//         {/* Title and Location positioned at bottom left */}
//         <div className="absolute bottom-3 left-3 right-3 text-white">
//           <h3 className="font-semibold text-base line-clamp-2 mb-1">{title}</h3>
//           <div className="flex items-center gap-1 text-sm">
//             <MapPin className="w-4 h-4" />
//             <span>{location}</span>
//           </div>
//         </div>

//         {/* Activity Type Badge - moved to top right for better balance */}
//         {/* {activityType && (
//           <div className="absolute top-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium">
//             {activityType}
//           </div>
//         )} */}
//       </div>

//       {/* Content Section */}
//       <div className="flex-1 p-4 space-y-3 my-3">
//         {/* Info Badges */}
//         <div className="flex flex-wrap gap-2">
//           <Badge variant="outline" className="flex items-center gap-1 text-xs">
//             <Clock className="w-3 h-3" />
//             {duration}
//           </Badge>
//           {people > 0 && (
//             <Badge
//               variant="outline"
//               className="flex items-center gap-1 text-xs"
//             >
//               <Users className="w-3 h-3" />
//               {people} {people === 1 ? "Person" : "People"}
//             </Badge>
//           )}
//           <Badge variant="outline" className="flex items-center gap-1 text-xs">
//             <MapPinned className="w-3 h-3" />
//             {stops} {stops === 1 ? "Stop" : "Stops"}
//           </Badge>
//         </div>

//         {/* Date Range with Calendar Icon */}
//         <div className="flex items-center gap-1 text-xs text-muted-foreground my-5">
//           <Calendar className="w-3 h-3" />
//           {dateRange}
//         </div>

//         {/* Highlights */}
//         <p className="text-sm text-foreground line-clamp-2 mb-4">
//           <span className="font-medium">Description:</span> {highlights}
//         </p>
//         <div className="flex flex-wrap gap-2 mt-3">
//           {Array.isArray(languages) && languages.length > 0
//             ? languages.map((name) => {
//                 const code = getLanguageCountryCode(name);
//                 return (
//                   <Badge
//                     key={name}
//                     variant="secondary"
//                     className="text-lg flex items-center gap-2 py-2 px-3 rounded-lg"
//                   >
//                     {code && (
//                       <ReactCountryFlag
//                         countryCode={code}
//                         svg
//                         style={{ width: "24px", height: "24px" }}
//                         title={name}
//                       />
//                     )}
//                     {name}
//                   </Badge>
//                 );
//               })
//             : ""}
//         </div>
//         <hr className="my-5"/>
//         {/* Footer */}
//         <div className="flex items-center justify-between pt-2">
//         <div className="flex items-center gap-2">

//         <Clock className="w-3 h-3" />
//           <span className="text-xs text-muted-foreground">
//             Posted {postedDate}
//           </span>
//         </div>
//           <Button
//             onClick={onView}
//             className="bg-[#D4AA25] hover:bg-[#C39A1F] text-white font-medium cursor-pointer"
//             size="lg"
//           >
//             View {count && `(${count})`}
//           </Button>
//         </div>
//       </div>
//     </Card>
//   );
// }



"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map";
import { Calendar, MapPin, Clock, Users, MapPinned } from "lucide-react";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { useEffect, useState } from "react";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";

interface JobCardProps {
  id: string;
  image: string;
  title: string;
  location: string;
  duration: string;
  people: number;
  stops: number;
  dateRange: string;
  highlights: string;
  languages: string[];
  postedDate: string;
  count?: number;
  onView: () => void;
  // New props from API
  agencyName?: string;
  priceRange?: string;
  activityType?: string;
  minPrice?: number;
  maxPrice?: number;
}

export function JobCard({
  id,
  image,
  title,
  location,
  duration,
  people,
  stops,
  dateRange,
  highlights,
  languages,
  postedDate,
  count,
  onView,
  agencyName,
  priceRange,
  activityType,
  minPrice,
  maxPrice,
}: JobCardProps) {
  const [imageUrl, setImageUrl] = useState<string>("/assets/images/profile/placeholder.svg");
  const [imageLoading, setImageLoading] = useState(true);

  const getLanguageCountryCode = (name: string): string | undefined => {
    const key = name.trim().toLowerCase();
    return LANGUAGE_FLAG_MAP[key];
  };

  // Function to get signed URL for Supabase images
  const getSignedImageUrl = async (imgPath: string): Promise<string> => {
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
          { bucket: BUCKETS.jobs, path: imgPath }
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

  useEffect(() => {
    let mounted = true;

    const loadImage = async () => {
      if (!image) {
        setImageUrl("/assets/images/profile/placeholder.svg");
        setImageLoading(false);
        return;
      }

      try {
        setImageLoading(true);
        const url = await getSignedImageUrl(image);

        if (mounted) {
          setImageUrl(url);
        }
      } catch (error) {
        console.error("Error loading image:", error);
        if (mounted) {
          setImageUrl("/assets/images/profile/placeholder.svg");
        }
      } finally {
        if (mounted) {
          setImageLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
    };
  }, [image]);

  return (
    <Card className="overflow-hidden shadow-lg transition-shadow flex flex-col h-full rounded-xl">
      {/* Image Section with Overlay Content */}
      <div className="relative h-54 w-full overflow-hidden bg-muted rounded-md">
        {/* Image with proper signed URL handling */}
        <Image
          src={imageUrl}
          alt={title}
          fill
          className="object-cover"
          onError={(e) => {
            // Fallback to placeholder if image fails to load
            const target = e.target as HTMLImageElement;
            target.src = "/assets/images/profile/placeholder.svg";
            setImageUrl("/assets/images/profile/placeholder.svg");
          }}
        />

        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

        {/* Loading state */}
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
            <div className="animate-pulse text-gray-500">Loading...</div>
          </div>
        )}

        {/* Title and Location positioned at bottom left */}
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <h3 className="font-semibold text-base line-clamp-2 mb-1">{title}</h3>
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="w-4 h-4" />
            <span>{location}</span>
          </div>
        </div>

        {/* Activity Type Badge */}
        {activityType && (
          <div className="absolute top-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium">
            {activityType}
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex-1 p-4 space-y-3 my-3">
        {/* Info Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
            <Clock className="w-3 h-3" />
            {duration}
          </Badge>
          {people > 0 && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 text-xs"
            >
              <Users className="w-3 h-3" />
              {people} {people === 1 ? "Person" : "People"}
            </Badge>
          )}
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
            <MapPinned className="w-3 h-3" />
            {stops} {stops === 1 ? "Stop" : "Stops"}
          </Badge>
        </div>

        {/* Date Range with Calendar Icon */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground my-5">
          <Calendar className="w-3 h-3" />
          {dateRange}
        </div>

        {/* Highlights */}
        <p className="text-sm text-foreground line-clamp-2 mb-4">
          <span className="font-medium">Description:</span> {highlights}
        </p>
        
        {/* Languages */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Array.isArray(languages) && languages.length > 0
            ? languages.map((name) => {
                const code = getLanguageCountryCode(name);
                return (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="text-lg flex items-center gap-2 py-2 px-3 rounded-lg"
                  >
                    {code && (
                      <ReactCountryFlag
                        countryCode={code}
                        svg
                        style={{ width: "24px", height: "24px" }}
                        title={name}
                      />
                    )}
                    {name}
                  </Badge>
                );
              })
            : ""}
        </div>
        
        <hr className="my-5"/>
        
        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span className="text-xs text-muted-foreground">
              Posted {postedDate}
            </span>
          </div>
          <Button
            onClick={onView}
            className="bg-[#D4AA25] hover:bg-[#C39A1F] text-white font-medium cursor-pointer"
            size="lg"
          >
            View {count && `(${count})`}
          </Button>
        </div>
      </div>
    </Card>
  );
}