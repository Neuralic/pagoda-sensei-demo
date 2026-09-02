"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hash, LucideMessageCircle, MapPin, MessageCircle, MessageCircleIcon, ShoppingBasket, ShoppingCart } from "lucide-react";
import Image from "next/image";
import avatar from "../../public/assets/images/profile/avatar.png";
import backgroundImage from "../../public/assets/images/profile/placeholder.svg";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";


type HeaderProfile = {
  cover_image_path?: string | null;
  profile_picture_path?: string | null;
  country?: string | null;
  city?: string | null;
} | null | undefined;

export function ProfileHeader({ profile, name: nameProp, lastName: lastNameProp, guideNumber: guideNumberProp }: { profile?: HeaderProfile; name?: string; lastName?: string; guideNumber?: number }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [name, setName] = useState<string>(nameProp ?? "");
  const [lastName, setLastName] = useState<string>(lastNameProp ?? "");
  const [guideNumber, setGuideNumber] = useState<number | null>(guideNumberProp ?? null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const tasks: Promise<void>[] = [];
        if (profile?.cover_image_path) {
          tasks.push(
            getSignedUrls([{ bucket: BUCKETS.coverImages, path: profile.cover_image_path }]).then((r) => {
              if (!cancelled) setCoverUrl(r[0]?.signedUrl || r[0]?.publicUrl || null);
            }) as unknown as Promise<void>
          );
        } else {
          setCoverUrl(null);
        }
        if (profile?.profile_picture_path) {
          tasks.push(
            getSignedUrls([{ bucket: BUCKETS.avatars, path: profile.profile_picture_path }]).then((r) => {
              if (!cancelled) setAvatarUrl(r[0]?.signedUrl || r[0]?.publicUrl || null);
            }) as unknown as Promise<void>
          );
        } else {
          setAvatarUrl(null);
        }
        await Promise.all(tasks);
      } catch {
        if (!cancelled) {
          setCoverUrl(null);
          setAvatarUrl(null);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [profile?.cover_image_path, profile?.profile_picture_path]);

  // If name props change (e.g., when viewing a public profile), update displayed values
  useEffect(() => {
    if (typeof nameProp === 'string') setName(nameProp);
    if (typeof lastNameProp === 'string') setLastName(lastNameProp);
    if (typeof guideNumberProp === 'number') setGuideNumber(guideNumberProp);
  }, [nameProp, lastNameProp, guideNumberProp]);

  return (
    <div className="w-full bg-white rounded-lg shadow-sm overflow-hidden border">
      {/* TOP IMAGE SECTION */}
      <div className="relative w-full h-48 md:h-60 lg:h-72">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt="Profile header background"
            fill
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <Image
            src={backgroundImage}
            alt="Profile header background"
            fill
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* PROFILE INFO SECTION */}
      <div className="px-4 md:px-6">
        <div className="flex items-center justify-center gap-4">
          {/* Avatar */}
          <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white overflow-hidden shadow-md -mt-4 z-10">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Profile avatar"
                fill
                sizes="(max-width: 768px) 80px, 96px"
                className="object-cover"
              />
            ) : (
              <Image
                src={avatar}
                alt="Profile avatar"
                fill
                sizes="(max-width: 768px) 80px, 96px"
                className="object-cover"
              />
            )}
          </div>
          {/* Name + Location */}
          <div className="flex-1 mb-2 py-2">
            <h2 className="text-xl text-[#191818] md:text-2xl font-bold">
              {([name, lastName].filter(Boolean).join(' ') || 'Your Name')}
            </h2>
            <p className="text-sm text-[#404040] md:text-base flex items-center gap-1 mt-1">
              <MapPin className="h-4 w-4" />
              {profile?.country && profile?.city
                ? `${profile.city}, ${profile.country}`
                : profile?.country || profile?.city || 'Location not specified'}
            </p>
          </div>
          {guideNumber && (
            <p className="text-sm text-[#404040] md:text-base flex items-center text-center gap-1 mt-1">
              <span className="font-bold text-[#D4AA25]">Guide Number:</span> {guideNumber}
            </p>
          )}
          {/* Message Button */}
          <div className="flex-1 flex justify-end  py-2">
            <Button
              className="bg-[#D4AA25] hover:bg-[#D4AA25] text-white rounded-lg px-4 md:px-6 py-4 md:py-6 shadow-md hover:shadow-lg transition cursor-pointer"
            >
              <MessageCircle className="text-white" /> Message me
            </Button>

          </div>

        </div>

        {/* Profile Card Below */}
        {/* <div className="mt-6">
          <ProfileCard />
        </div> */}
      </div>
    </div>
  );
}
