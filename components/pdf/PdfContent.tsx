"use client";
import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Logo from "../../public/assets/images/pdf_logo.png";
import { Bed, Clock, MapPin, Plane, Star, User } from "lucide-react";
import locationMap from '../../public/assets/images/location.png';
import clockIcon from '../../public/assets/images/clock.png';
import dateIcon from '../../public/assets/images/calender.png';
// import largeDate from "./assets/images/large_calender.png";
import guideImage from "../../public/assets/images/guide_image.png";
import demoImage from "../../public/assets/images/cover.png"
import "./PdfContent.css";
import { Day } from "@/app/types";
import { BUCKETS } from "@/lib/buckets";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { normalizeJobImagePaths, signJobOrTourImagePaths } from "@/lib/job-tour-image-sign";
import { formatGuideFulfillmentBlock } from "@/lib/guide-fulfillment";
import { buildPublicProfileUrl } from "@/lib/profile-refresh";
import {
  canonicalizeActivityTypeLabel,
} from "@/lib/tour-activity-types";
import { resolveActivityIconPath } from "@/lib/activity-type-icons";
import { resolvePdfTitleSubtitle } from "@/lib/itinerary-pdf-defaults";
import {
  buildDayPdfDefaults,
  mergeDaySummaryWithActivities,
} from "@/lib/itinerary-day-summary";
import { parseIntakeData } from "@/lib/itinerary-intake";
export { addSmartPageBreaks } from "./smart-page-breaks";


interface ApplicationType {
  first_name: string;
  last_name: string;
  why: string;
  languages: string[]
  profiles: {
    profile_picture_path?: string
    bio?: string
    intro_video_path?: string
    profile_slug?: string | null
  }[] | null
  applicant_id?: string; // Optional unique identifier
  offer_status: string;
  is_finalist?: boolean; // Flag to mark as finalist (only one per job)
  /** Guide price (set when offer accepted / hired). Used for PDF total when one candidate is selected. */
  guide_price?: number | null;
  pickup_date?: string | null;
  pickup_time?: string | null;
  pickup_location?: string | null;
  guide_display_name?: string | null;
  guide_whatsapp?: string | null;
}

interface Activity {
  id: string;
  title: string;
  subtitle?: string;
  time?: string;
  location?: string;
  duration?: string;
  description?: string;
  image?: string | null;
  images?: string[] | null;
  application?: ApplicationType[];
  activity_type?: string;
  price?: number | null;
  /** Per-person × participants (for display when price is from tour) */
  pricePerAdult?: number | null;
  pricePerChild?: number | null;
  pricePerInfant?: number | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  /** When true, omit this line from the PDF (e.g. canceled Transferz journey). */
  transferzJourneyCanceled?: boolean;
  /** Notes for the advisor — shown on the proposal (jobs.notes). */
  notes?: string | null;
  /** Notes for the guide/operator (jobs.advisor_comments) — not shown on client PDF. */
  advisorComments?: string | null;
}
interface PdfContentProps {
  /** When false, skip preloading every activity image on each itinerary change (edit page); print flow still uses waitForImages. Default true. */
  eagerImagePreload?: boolean;
  itinerary: {
    id: string;
    name: string;
    location: string;
    start_date: string;
    end_date: string;
    image?: string | null;
    description?: string | null;
    status?: "draft" | "published" | "banned" | "archived";
    highlights?: string[] | null;
    arrival_transfer?: boolean;
    arrival_flight_number?: string | null;
    arrival_flight_time?: string | null;
    departure_transfer?: boolean;
    departure_flight_number?: string | null;
    departure_flight_time?: string | null;
    pdf_title?: string | null;
    pdf_subtitle?: string | null;
    intake_data?: unknown;
    /** Itinerary owner (advisor) — PDF cover uses this, not the logged-in admin. */
    user_id?: string | null;
  };
  tourDays?: Day[];
  activitiesByDay?: Record<string, Activity[]>;
}

type UserPayload = {
  email?: string
  phone?: string
  dateOfBirth?: string
  password?: string
  firstName?: string
  lastName?: string
  country?: string
  city?: string
  website?: string
}

function absoluteAssetUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return path;
}

// Utility function to preload images
const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve) => {
    if (!src || src.startsWith('data:') || src === '/assets/placeholder.svg') {
      resolve();
      return;
    }
    
    // If it's a placeholder, resolve immediately
    if (src.includes('placeholder')) {
      resolve();
      return;
    }
    
    const img = new window.Image();
    
    // Set crossOrigin only for external URLs
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    
    const timeout = setTimeout(() => {
      // Timeout after 10 seconds - resolve anyway to not block printing
      console.warn(`Image load timeout: ${src}`);
      resolve();
    }, 10000);
    
    img.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    
    img.onerror = () => {
      clearTimeout(timeout);
      // Don't reject on error, just resolve to continue
      console.warn(`Failed to load image: ${src}`);
      resolve();
    };
    
    img.src = src;
  });
};

// Preload all images in the component using signed URLs
const preloadAllImages = async (
  activitiesByDay?: Record<string, Activity[]>, 
  avatarUrl?: string,
  imageUrlMap?: Record<string, string>,
  guideImageUrlMap?: Record<string, string>
): Promise<void> => {
  const imagePromises: Promise<void>[] = [];

  // Helper to get the correct URL (signed or original)
  const getImageUrl = (img: string, urlMap?: Record<string, string>): string | null => {
    if (!img || typeof img !== 'string') return null;
    // If it's already a full URL, use it
    if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('/')) {
      return img;
    }
    // Otherwise, check the URL map for signed URL
    if (urlMap && urlMap[img]) {
      return urlMap[img];
    }
    return null;
  };

  // Preload avatar
  if (avatarUrl) {
    imagePromises.push(preloadImage(avatarUrl));
  }

  // Preload activity images
  if (activitiesByDay && imageUrlMap) {
    Object.values(activitiesByDay).forEach((activities) => {
      activities.forEach((activity) => {
        // Activity images
        if (Array.isArray(activity.images)) {
          activity.images.forEach((img) => {
            const url = getImageUrl(img, imageUrlMap);
            if (url) {
              imagePromises.push(preloadImage(url));
            }
          });
        }

        // Guide profile images
        if (Array.isArray(activity.application)) {
          activity.application.forEach((app) => {
            const profileImg = app.profiles?.[0]?.profile_picture_path;
            if (profileImg) {
              const url = getImageUrl(profileImg, guideImageUrlMap);
              if (url) {
                imagePromises.push(preloadImage(url));
              }
            }
          });
        }
      });
    });
  }

  await Promise.all(imagePromises);
};

const PdfContent = forwardRef<HTMLDivElement, PdfContentProps>(({ eagerImagePreload = true, itinerary, tourDays, activitiesByDay }, ref) => {
  /** Canceled Transferz bookings stay in itinerary data but must not appear in the client PDF. */
  const pdfActivitiesByDay = useMemo(() => {
    if (!activitiesByDay) return undefined;
    return Object.fromEntries(
      Object.entries(activitiesByDay).map(([dayId, acts]) => [
        dayId,
        acts.filter((a) => !a.transferzJourneyCanceled),
      ])
    ) as Record<string, Activity[]>;
  }, [activitiesByDay]);

  const [userInfo, setUserInfo] = useState<UserPayload>();
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [imageUrlMap, setImageUrlMap] = useState<Record<string, string>>({});
  const [guideImageUrlMap, setGuideImageUrlMap] = useState<Record<string, string>>({});
  const [videoUrlMap, setVideoUrlMap] = useState<Record<string, string>>({});

  const [userWebsite, setUserWebsite] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  const { title: pdfTitle, subtitle: pdfSubTitle } = useMemo(
    () => resolvePdfTitleSubtitle(itinerary, pdfActivitiesByDay),
    [itinerary, pdfActivitiesByDay]
  );

  /** Prefer saved day fields; merge booked tour titles into summaries automatically. */
  const pdfTourDays = useMemo(() => {
    if (!tourDays?.length) return tourDays;
    const defaults = buildDayPdfDefaults(
      tourDays.map((d) => d.id),
      pdfActivitiesByDay,
      parseIntakeData(itinerary.intake_data)?.destinationStays
    );
    return tourDays.map((d) => {
      const def = defaults[d.id];
      return {
        ...d,
        summary: mergeDaySummaryWithActivities(
          d.summary,
          pdfActivitiesByDay?.[d.id]
        ),
        arrivalHeading: String(d.arrivalHeading || "").trim()
          ? d.arrivalHeading
          : def.arrivalHeading,
        arrivalLocation: String(d.arrivalLocation || "").trim()
          ? d.arrivalLocation
          : def.arrivalLocation,
      };
    });
  }, [tourDays, pdfActivitiesByDay, itinerary.intake_data]);

  const imageUrlMapRef = useRef(imageUrlMap);
  const guideImageUrlMapRef = useRef(guideImageUrlMap);
  const videoUrlMapRef = useRef(videoUrlMap);
  imageUrlMapRef.current = imageUrlMap;
  guideImageUrlMapRef.current = guideImageUrlMap;
  videoUrlMapRef.current = videoUrlMap;

  /** Get the effective price for one activity: use job display price if set, otherwise the selected candidate's guide_price (hired > finalist > first candidate). */
  const getActivityEffectivePrice = useMemo(() => {
    return (activity: Activity): number | null => {
      if (activity.price != null && Number.isFinite(activity.price)) {
        return Number(activity.price);
      }
      const apps = Array.isArray(activity.application) ? activity.application : [];
      const isHired = (app: ApplicationType) => app.offer_status === "completed" || app.offer_status === "hired" || app.offer_status === "accepted";
      const isFinalist = (app: ApplicationType) => app.is_finalist === true;
      const isCandidate = (app: ApplicationType) => app.offer_status === "candidate" || (app as unknown as { is_candidate?: boolean }).is_candidate === true;
      const hasAnyFinalist = apps.some((a) => isFinalist(a));
      const chosen = apps.find((a) => isHired(a))
        ?? apps.find((a) => isFinalist(a))
        ?? (!hasAnyFinalist ? apps.find((a) => isCandidate(a)) : undefined);
      if (chosen?.guide_price != null && Number.isFinite(Number(chosen.guide_price))) {
        return Number(chosen.guide_price);
      }
      return null;
    };
  }, []);

  const pdfTotalPrice = useMemo(() => {
    if (!tourDays || !pdfActivitiesByDay) return 0;
    let total = 0;
    for (const d of tourDays) {
      const activities = pdfActivitiesByDay[d.id] ?? [];
      for (const a of activities) {
        const p = getActivityEffectivePrice(a);
        if (p != null) total += p;
      }
    }
    return total;
  }, [tourDays, pdfActivitiesByDay, getActivityEffectivePrice]);

  useEffect(() => {
    let cancelled = false;
    async function loadUserAndProfile() {
      try {
        const ownerId =
          typeof itinerary.user_id === "string" && itinerary.user_id.trim()
            ? itinerary.user_id.trim()
            : null;

        // Prefer the itinerary owner (advisor) so admin Preview shows their name/photo,
        // not the logged-in admin’s empty account profile.
        if (ownerId) {
          const ownerRes = await fetch(`/api/profile/${encodeURIComponent(ownerId)}`, {
            cache: "no-store",
          }).catch(() => null);
          const ownerData = ownerRes?.ok
            ? await ownerRes.json().catch(() => ({ ok: false }))
            : { ok: false };

          if (cancelled) return;

          if (ownerData?.ok && ownerData.user) {
            const user = ownerData.user;
            setUserWebsite(ownerData.profile?.website || "");
            setUserInfo({
              firstName: user.firstName || user.first_name || user.name || "",
              lastName: user.lastName || user.last_name || "",
              email: user.email || "",
              phone: user.phone || "",
              dateOfBirth: user.dateOfBirth || user.date_of_birth || "",
              country: user.country || "",
              city: user.city || "",
            });

            const agentProfile = ownerData.profile;
            const preSigned =
              typeof agentProfile?.avatarUrl === "string" ? agentProfile.avatarUrl : "";
            if (preSigned) {
              setAvatarUrl(preSigned);
              return;
            }
            if (agentProfile?.profile_picture_path) {
              const resp = await getSignedUrls([
                { bucket: BUCKETS.avatars, path: agentProfile.profile_picture_path },
              ]);
              if (!cancelled) {
                setAvatarUrl(resp[0]?.signedUrl ?? "");
              }
            } else if (!cancelled) {
              setAvatarUrl("");
            }
            return;
          }
        }

        const [userRes, profileRes] = await Promise.all([
          fetch("/api/user", { cache: "no-store" }).catch(() => ({
            ok: false,
            json: async () => ({ ok: false, user: null }),
          })),
          fetch("/api/profile", { cache: "no-store" }).catch(() => ({
            ok: false,
            json: async () => ({ ok: false, profile: null }),
          })),
        ]);

        const [userData, profileData] = await Promise.all([
          userRes.ok ? userRes.json().catch(() => ({ ok: false, user: null })) : Promise.resolve({ ok: false, user: null }),
          profileRes.ok ? profileRes.json().catch(() => ({ ok: false, profile: null })) : Promise.resolve({ ok: false, profile: null }),
        ]);

        if (cancelled) return;

        const user = userData?.user;

        setUserWebsite(profileData?.profile?.website || "");

        setUserInfo({
          firstName: user?.firstName || user?.first_name || "",
          lastName: user?.lastName || user?.last_name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          dateOfBirth: user?.dateOfBirth || user?.date_of_birth || "",
          country: user?.country || "",
          city: user?.city || "",
        });

        const agentProfile = profileData?.profile;
        if (agentProfile?.profile_picture_path) {
          const resp = await getSignedUrls([
            { bucket: BUCKETS.avatars, path: agentProfile.profile_picture_path },
          ]);
          if (!cancelled) {
            setAvatarUrl(resp[0]?.signedUrl ?? "");
          }
        } else if (!cancelled) {
          setAvatarUrl("");
        }
      } catch {
        if (!cancelled) {
          setAvatarUrl("");
        }
      }
    }
    loadUserAndProfile();
    return () => {
      cancelled = true;
    };
  }, [itinerary.id, itinerary.user_id]);

  useEffect(() => {
    let cancelled = false;

    async function signActivityMediaAndMaybePreload() {
      if (!pdfActivitiesByDay) return;

      const imagePathsToSign: string[] = [];
      const guideImagePathsToSign: string[] = [];
      const videoPathsToSign: string[] = [];

      const imgSeen = imageUrlMapRef.current;
      const guideSeen = guideImageUrlMapRef.current;
      const vidSeen = videoUrlMapRef.current;

      Object.values(pdfActivitiesByDay).forEach((activities) => {
        activities.forEach((activity) => {
          normalizeJobImagePaths(activity.images).forEach((img) => {
            if (!imgSeen[img]) imagePathsToSign.push(img);
          });

          if (Array.isArray(activity.application)) {
            activity.application.forEach((app) => {
              const profileImg = app.profiles?.[0]?.profile_picture_path;
              if (
                profileImg &&
                typeof profileImg === "string" &&
                !profileImg.startsWith("http://") &&
                !profileImg.startsWith("https://") &&
                !profileImg.startsWith("/") &&
                !guideSeen[profileImg]
              ) {
                guideImagePathsToSign.push(profileImg);
              }

              const videoPath = app.profiles?.[0]?.intro_video_path;
              if (
                videoPath &&
                typeof videoPath === "string" &&
                !videoPath.startsWith("http://") &&
                !videoPath.startsWith("https://") &&
                !videoPath.startsWith("/") &&
                !vidSeen[videoPath]
              ) {
                videoPathsToSign.push(videoPath);
              }
            });
          }
        });
      });

      let finalImageMap: Record<string, string> = { ...imageUrlMapRef.current };
      let finalGuideImageMap: Record<string, string> = { ...guideImageUrlMapRef.current };

      const uniqueImagePaths = [...new Set(imagePathsToSign)];
      if (uniqueImagePaths.length > 0) {
        try {
          const signedActivityImages = await signJobOrTourImagePaths(uniqueImagePaths);
          if (!cancelled) {
            finalImageMap = { ...finalImageMap, ...signedActivityImages };
          }
        } catch (error) {
          console.error("Error signing activity images:", error);
        }
      }

      const otherItemsToSign = [
        ...[...new Set(guideImagePathsToSign)].map((path) => ({ bucket: BUCKETS.avatars, path })),
        ...[...new Set(videoPathsToSign)].map((path) => ({ bucket: BUCKETS.introVideos, path })),
      ];

      if (otherItemsToSign.length > 0) {
        try {
          const signedResults = await getSignedUrls(otherItemsToSign);

          if (!cancelled) {
            const newVideoMap: Record<string, string> = { ...videoUrlMapRef.current };

            signedResults.forEach((result, index) => {
              const item = otherItemsToSign[index];
              if (!item) return;

              const url = result?.signedUrl || result?.publicUrl;
              if (!url) return;

              if (item.bucket === BUCKETS.avatars) {
                finalGuideImageMap[item.path] = url;
              } else if (item.bucket === BUCKETS.introVideos) {
                newVideoMap[item.path] = url;
              }
            });

            setGuideImageUrlMap(finalGuideImageMap);
            setVideoUrlMap(newVideoMap);
          }
        } catch (error) {
          console.error("Error signing guide media:", error);
        }
      }

      if (!cancelled) {
        setImageUrlMap(finalImageMap);
      }

      if (cancelled) return;

      if (eagerImagePreload) {
        setImagesLoaded(false);
        try {
          await preloadAllImages(pdfActivitiesByDay, avatarUrl, finalImageMap, finalGuideImageMap);
          if (!cancelled) {
            setImagesLoaded(true);
          }
        } catch (error) {
          console.error("Error preloading images:", error);
          if (!cancelled) {
            setImagesLoaded(true);
          }
        }
      } else {
        setImagesLoaded(true);
      }
    }

    signActivityMediaAndMaybePreload();
    return () => {
      cancelled = true;
    };
  }, [pdfActivitiesByDay, eagerImagePreload, avatarUrl]);

  const getIcon = (activityType: string) => {
    return absoluteAssetUrl(resolveActivityIconPath(activityType));
  };

  return (
    <div ref={ref} className="vaz-pdf-page">

      {/* Cover Page */}
      <div className="firstPage">
        <div className="frame">
          <div className="frame-wrapper">
            <div className="div">
              {avatarUrl ? (
                <div
                  className="flex items-center justify-center"
                  style={{
                    maxWidth: '200px',
                    // minHeight: '60px',
                    // maxHeight: '100px',
                    borderRadius: '12px',
                    // border: '1px solid #e0e0e0',
                    // boxShadow: '0 2px 8px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(255,255,255,0.5)',
                    // padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      // padding: '4px'
                    }}
                  >
                    <img
                      src={avatarUrl}
                      alt="Agent logo"
                      className="object-contain"
                      style={{ 
                        width: '100%',
                        height: 'auto',
                        maxHeight: '76px',
                        objectFit: 'contain',
                        display: 'block',
                        // filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.05))'
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-center"
                  style={{
                    width: '200px',
                    height: '100px',
                    borderRadius: '12px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e0e0e0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  <User className="w-12 h-12 text-gray-400" />
                </div>
              )}

              <div className="div-2 ml-4">
                <div className="text-base font-light">Organized by:</div>
                <div className="text-2xl font-light">{userInfo?.firstName} {userInfo?.lastName}</div>
              </div>
            </div>
          </div>
          <div className="div-3">
            <div className="div-4">
              <div className="pathfinder-japan text-[#c0301d] font-stentiga">{pdfTitle}</div>
              <div className="japan-trip">{pdfSubTitle}</div>
            </div>
            <div className="div-5">
              <div className="div-6">
                <img src="/assets/images/location.png" alt="location" />
                <div className="div-2">
                  <div className="text-wrapper">Destination</div>
                  <div className="text-wrapper-3">{itinerary.location}</div>
                </div>
              </div>
              <div className="div-6">
                <div className="div-wrapper">
                  <div className="vector-wrapper"><img src="/assets/images/clock.png" alt="location" /></div>
                </div>
                <div className="div-2">
                  <div className="text-wrapper">Duration</div>
                  <div className="text-wrapper-3">
                    {(() => {
                      const start = new Date(itinerary.start_date);
                      const end = new Date(itinerary.end_date);
                      const days = Math.max(1, Math.round((+end - +start) / 86400000) + 1);
                      return `${days} day${days > 1 ? "s" : ""}`;
                    })()}
                  </div>
                </div>
              </div>
              <div className="div-6">
                <div className="div-wrapper">
                  <div className="vector-wrapper"><img src="/assets/images/calender.png" alt="location" /></div>
                </div>
                <div className="div-2">
                  <div className="text-wrapper">Start date</div>
                  <div className="text-wrapper-3">{itinerary.start_date}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* <div className="frame">
          <div className="frame-wrapper">
            <div className="frame-5">
              <div className="pathfinder-japan">PATHFINDER JAPAN</div>
              <div className="ready-set-go-tour">“READY-SET-GO!” TOUR</div>
            </div>
          </div>
        </div> */}

        <div className="img">
          <div className="frame-6">

          </div>
        </div>

        <div className="frame-10">
          <div className="text-wrapper-5">{userInfo?.phone}</div>
          <div className="text-wrapper-5">{userInfo?.email}</div>
          <div className="text-wrapper-6">{userWebsite}</div>
        </div>
      </div>

      {/* Trip Pages */}

      <div className="dataPage">
        <div className="dayFrame">
          <div className="arrival-japan font-stentiga">Where Your Journey to the Land of the Rising Sun Begins</div>
          <div className="arrival-in-tokyo">Trip summary</div>
          {/* <div className="text-wrapper">A  {(() => {
            const start = new Date(itinerary.start_date);
            const end = new Date(itinerary.end_date);
            const days = Math.max(1, Math.round((+end - +start) / 86400000) + 1);
            return `${days} day${days > 1 ? "s" : ""}`;
          })()} tour that will take you from Tokyo to
            Osaka, Hiroshima, Kyoto, Hiroshima and Miyajima!
            This tour offers a
            mix of guided and non-guided experiences.</div> */}
        </div>

        {pdfTourDays?.map((d) => (

          <div className="ArrivalFrame" key={d.id}>
            <div className="">
              <img src="/assets/images/large_calender.png" alt={d.title}
                loading="eager"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                }}
              />
            </div>

            <div className="div-2">
              <div className="div-3">
                <div className="div-wrapper-2">
                  <div className="text-wrapper">{d.title}-{d.arrivalLocation}</div>
                </div>
                <div className="div-4">
                  <div className="div-5">
                    <div className="text-wrapper-2">{d.dayOfWeek}, {d.label}</div>
                  </div>
                </div>
              </div>
              <div className="dayWiseList">
                {d.summary.map((item, idx) => (
                  <div key={idx} className="dayPoint">
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

      </div>

      {/* Arrival */}
      <div className="page-break" />
      <div className="dataPage">
        {pdfTourDays?.filter((d) => (pdfActivitiesByDay || {})[d.id]?.length > 0).map((d, index) => (
          <div key={d.id} className="pt-0 mt-0">
            <div key={d.id} className={index === 0 ? "dayFrame pt-0 mt-0" : "dayFrame page-break"}>
              <div className="arrival-japan date-style">{d.title.toLocaleUpperCase()}</div>
              <div className="arrival-in-tokyo day-activity-title font-stentiga">{d?.arrivalHeading} </div>
              <div className="text-wrapper day-activity-date">{d.dayOfWeek}, {d.label}</div>
            </div>
            {(pdfActivitiesByDay?.[d.id] || []).map((activity, activityIndex) => {
              const effectivePrice = getActivityEffectivePrice(activity);
              return (
              <div key={activity.id} className="activity-container" data-activity-index={activityIndex}>
                <div className="arrival-wrapper">
                  <div className="logo-wrapper">
                    <img src={getIcon(activity?.activity_type || "")} alt={canonicalizeActivityTypeLabel(activity?.activity_type) || activity?.activity_type || ""} />
                  </div>
                  <div className="arrivalInfo">
                    <div className="div-3">
                      <div className="text-wrapper">{activity.title}</div>
                      <div className="arrivalTime">
                        <div className="arrivalClock">
                          <div className="img-wrapper"><Clock size={14} /></div>
                          <div>{activity.time}</div>
                        </div>
                        <div className="arrivalClock">
                          <div className="img-wrapper"><MapPin size={14} /></div>
                          <div >{activity.location}</div>
                        </div>
                        {effectivePrice != null && (
                          <div className="arrivalClock" style={{ marginLeft: "auto" }}>
                            <strong>¥{Number(effectivePrice).toLocaleString()}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {Array.isArray(activity.images) && activity.images.length > 0 && (
                  <div className="activity-images-row" style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '16px' }}>
                    {(() => {
                      const images = activity.images.slice(0, 5).filter(img => img && typeof img === 'string'); // Max 5 images
                      const imageCount = images.length;

                      if (imageCount === 0) return null;

                      // Helper to get safe image URL
                      const getImageUrl = (img: string) => {
                        if (!img) return '/assets/placeholder.svg';
                        if (img.startsWith('http://') || img.startsWith('https://')) return img;
                        if (img.startsWith('/')) return img;
                        // Check if we have a signed URL for this path
                        if (imageUrlMap[img]) return imageUrlMap[img];
                        // If it's a storage path that hasn't been signed yet, return placeholder
                        return '/assets/placeholder.svg';
                      };

                      // 1 image: Full width with fixed height for PDF layout
                      if (imageCount === 1) {
                        return (
                          <div style={{ position: 'relative', width: '100%', height: 200, overflow: 'hidden' }}>
                            <img
                              src={getImageUrl(images[0])}
                              alt={`${activity.title} image 1`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                              loading="eager"
                              crossOrigin="anonymous"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/assets/placeholder.svg';
                              }}
                            />
                          </div>
                        );
                      }

                      // 2 images: Side by side
                      if (imageCount === 2) {
                        return (
                          <>
                            <div style={{ position: 'relative', flex: 1, height: 200, overflow: 'hidden' }}>
                              <img
                                src={getImageUrl(images[0])}
                                alt={`${activity.title} image 1`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                loading="eager"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                }}
                              />
                            </div>
                            <div style={{ position: 'relative', flex: 1, height: 200, overflow: 'hidden' }}>
                              <img
                                src={getImageUrl(images[1])}
                                alt={`${activity.title} image 2`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                }}
                              />
                            </div>
                          </>
                        );
                      }

                      // 3 images: 1 large on left, 2 stacked on right
                      if (imageCount === 3) {
                        return (
                          <>
                            <div style={{ position: 'relative', flex: 1, height: 200, overflow: 'hidden' }}>
                              <img
                                src={getImageUrl(images[0])}
                                alt={`${activity.title} image 1`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                loading="eager"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                }}
                              />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', height: 200 }}>
                              {images.slice(1, 3).map((image, idx) => (
                                <div key={idx} style={{ position: 'relative', flex: 1, height: 'calc(50% - 4px)', overflow: 'hidden' }}>
                                  <img
                                    src={getImageUrl(image)}
                                    alt={`${activity.title} image ${idx + 2}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                    loading="eager"
                                    crossOrigin="anonymous"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      }

                      // 4 images: 1 large on left, 3 stacked on right
                      if (imageCount === 4) {
                        return (
                          <>
                            <div style={{ position: 'relative', flex: 1, height: 200, overflow: 'hidden' }}>
                              <img
                                src={getImageUrl(images[0])}
                                alt={`${activity.title} image 1`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                loading="eager"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                }}
                              />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', height: 200 }}>
                              {images.slice(1, 4).map((image, idx) => (
                                <div key={idx} style={{ position: 'relative', height: 'calc(33.333% - 5.33px)', overflow: 'hidden' }}>
                                  <img
                                    src={getImageUrl(image)}
                                    alt={`${activity.title} image ${idx + 2}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                    loading="eager"
                                    crossOrigin="anonymous"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      }

                      // 5 images: 1 large on left, 4 in 2x2 grid on right (like screenshot)
                      if (imageCount === 5) {
                        return (
                          <>
                            <div style={{ position: 'relative', flex: 1, height: 200, overflow: 'hidden' }}>
                              <img
                                src={getImageUrl(images[0])}
                                alt={`${activity.title} image 1`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                loading="eager"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                }}
                              />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', height: 200 }}>
                              {/* Top row: 2 images */}
                              <div style={{ display: 'flex', gap: '8px', height: 'calc(50% - 4px)' }}>
                                {images.slice(1, 3).map((image, idx) => (
                                  <div key={idx} style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>
                                    <img
                                      src={getImageUrl(image)}
                                      alt={`${activity.title} image ${idx + 2}`}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                              {/* Bottom row: 2 images */}
                              <div style={{ display: 'flex', gap: '8px', height: 'calc(50% - 4px)' }}>
                                {images.slice(3, 5).map((image, idx) => (
                                  <div key={idx} style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>
                                    <img
                                      src={getImageUrl(image)}
                                      alt={`${activity.title} image ${idx + 4}`}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/assets/images/placeholder.svg';
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        );
                      }

                      return null;
                    })()}
                  </div>
                )}
                {/* <div className="arrivalImage">
                  <Image src={activity.image && (activity.image.startsWith('http') || activity.image.startsWith('/')) ? activity.image : '/assets/placeholder.svg'} alt={activity.title} fill style={{ objectFit: 'cover' }} />
                </div> */}

                {activity.description ? (
                  <div className="arrivingContent">
                    {activity.description.split('\n').map((paragraph, idx) => 
                      paragraph.trim() ? (
                        <p key={idx}>
                          {paragraph.trim()}
                        </p>
                      ) : null
                    )}
                  </div>
                ) : null}

                {Array.isArray(activity?.application) && activity.application.map((apply: ApplicationType, index: number) => {
                  const profileImage = apply.profiles?.[0]?.profile_picture_path;
                  const imageUrl = profileImage
                    ? (profileImage.startsWith('http://') || profileImage.startsWith('https://') || profileImage.startsWith('/')
                      ? profileImage
                      : guideImageUrlMap[profileImage] || "/assets/placeholder.svg")
                    : "/assets/placeholder.svg";
                  
                  const videoPath = apply.profiles?.[0]?.intro_video_path;
                  const videoUrl = videoPath
                    ? (videoPath.startsWith('http://') || videoPath.startsWith('https://')
                      ? videoPath
                      : videoUrlMap[videoPath] || null)
                    : null;

                  // Show hired guides, finalists, or fallback to first candidate if no finalist selected
                  // Priority: hired > finalist > (fallback to first candidate if no finalist selected)
                  const isHired = apply.offer_status === "completed" || apply.offer_status === "hired" || apply.offer_status === "accepted";
                  const isFinalist = apply.is_finalist === true;
                  const isCandidate = apply.offer_status === "candidate" || (apply as any).is_candidate === true;
                  
                  // Check if any finalist exists in the applications
                  const hasAnyFinalist = Array.isArray(activity.application) && activity.application.some((a: ApplicationType) => a.is_finalist === true);
                  
                  // Show if hired, or if finalist (all finalists will be shown), or if no finalist exists yet (fallback to first candidate)
                  // But prioritize finalist over regular candidates
                  const shouldShow = isHired || isFinalist || (isCandidate && !hasAnyFinalist);
                  
                  if (shouldShow) {
                    return (
                      <div className="travelGuide" key={index}>
                        <div className="headingName text-bold">YOUR TOUR GUIDE/OPERATOR:</div>

                        <div className="frame-wrapper-4">
                          <div className="guideName">
                            <img
                              className="img-2"
                              src={imageUrl}
                              alt="guide"
                              loading="eager"
                              crossOrigin="anonymous"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "/assets/placeholder.svg";
                              }}
                            />

                            <div className="div-6">
                              <div className="text-wrapper-3">
                                {apply.first_name} {apply.last_name}
                              </div>
                              <div className="pdf-guide-role-label">
                                {isHired
                                  ? "Hired"
                                  : isFinalist
                                    ? "Final candidate"
                                    : isCandidate
                                      ? "Candidate"
                                      : null}
                              </div>
                              {(() => {
                                const slug = apply.profiles?.[0]?.profile_slug;
                                const profileUrl = buildPublicProfileUrl(slug);
                                if (!profileUrl) return null;
                                return (
                                  <div style={{ marginTop: "4px", fontSize: "12px" }}>
                                    <a
                                      href={profileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ color: "#D4AA25", textDecoration: "underline" }}
                                    >
                                      View guide profile
                                    </a>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="guideDescription pt-2">
                            {(() => {
                              const fulfillmentText = formatGuideFulfillmentBlock(apply);
                              if (!fulfillmentText) return null;
                              return (
                                <div style={{ marginBottom: "12px", padding: "10px", background: "#f8fafc", borderRadius: "6px" }}>
                                  <div style={{ fontWeight: 600, marginBottom: "6px" }}>Your pickup details</div>
                                  {fulfillmentText.split("\n").map((line, idx) => (
                                    <p key={idx} style={{ margin: "2px 0", fontSize: "14px" }}>
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              );
                            })()}
                            {(() => {
                              const bio = apply.profiles?.[0]?.bio || "Experienced tour guide ready to make your journey unforgettable.";
                              return bio.split('\n').map((paragraph, idx) => 
                                paragraph.trim() ? (
                                  <p key={idx}>
                                    {paragraph.trim()}
                                  </p>
                                ) : null
                              );
                            })()}
                            <span>Languages spoken</span>
                            <ul>
                              {Array.isArray(apply.languages) && apply.languages.length > 0 ? (
                                apply.languages.map((lang: string, langIndex: number) => (
                                  <li key={langIndex}>{lang}</li>
                                ))
                              ) : (
                                <li>English</li>
                              )}
                            </ul>
                            {videoUrl && (
                              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                                <a
                                  href={videoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    color: '#2563eb',
                                    textDecoration: 'underline',
                                    fontSize: '14px',
                                    fontWeight: '500'
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M8 5v14l11-7z" fill="currentColor" />
                                  </svg>
                                  Watch Intro Video
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                })}

              </div>
            );
            })}
          </div>
        ))}
        {pdfTotalPrice > 0 && (
          <div
            className="dayFrame"
            style={{
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: "2px solid #c0301d",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>Total Price (all activities):</span>
            <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "#c0301d" }}>
              ¥{pdfTotalPrice.toLocaleString()}
            </span>
          </div>
        )}
      </div>

    </div>
  );
});

PdfContent.displayName = "ItineraryContent";
export default PdfContent;
