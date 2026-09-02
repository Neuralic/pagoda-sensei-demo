"use client";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ArrowLeft, MapPin, MessageCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import cartIcon from "../../../public/assets/images/location.svg";
import avatar from "../../../public/assets/images/profile/avatar.png";
import backgroundImage from "../../../public/assets/images/profile/placeholder.svg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { Button } from "@/components/ui/button";
import { MiniUser } from "@/app/types";
type Profile = {
  bio?: string | null;
  languages?: string[] | null;
  specialties?: string[] | null;
  profile_picture_path?: string | null;
  cover_image_path?: string | null;
  intro_video_path?: string | null;
  intro_photos_paths?: string[] | null;
  document?: string[] | null;
  website?: string | null;
  contact_email?: string | null;
  country?: string | null;
  city?: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userInfo, setUserInfo] = useState<MiniUser | null>(null);

  const [name, setName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load profile: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setProfile(json.profile ?? null);
        setUserInfo(json.user ?? null);
      } catch (err) {
        if (!cancelled) setProfile(null);
      } finally {
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load current user name to display on own public profile page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.ok && data?.user) {
          setName(typeof data.user.firstName === 'string' ? data.user.firstName : '');
          setLastName(typeof data.user.lastName === 'string' ? data.user.lastName : '');
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // const [name, setName] = useState<string>(nameProp ?? "");
  // const [lastName, setLastName] = useState<string>(lastNameProp ?? "");

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
  // useEffect(() => {
  //   if (typeof nameProp === 'string') setName(nameProp);
  //   if (typeof lastNameProp === 'string') setLastName(lastNameProp);
  // }, [nameProp, lastNameProp]);



  return (
    <main className="min-h-screen bg-background p-10">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-2xl text-[#D4AA25] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          <h2>Back to Job Boards</h2>
        </button>
      </div>
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
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative -mt-4 z-10 flex items-center justify-center" style={{ maxWidth: '96px' }}>
              {avatarUrl ? (
                <div style={{ width: '100%', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Image
                    src={avatarUrl}
                    alt="Agent logo"
                    width={0}
                    height={0}
                    sizes="(max-width: 768px) 80px, 96px"
                    className="object-contain"
                    style={{ width: '100%', height: 'auto' }}
                  />
                </div>
              ) : (
                <div style={{ width: '100%', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Image
                    src={avatar}
                    alt="Agent logo"
                    width={0}
                    height={0}
                    sizes="(max-width: 768px) 80px, 96px"
                    className="object-contain"
                    style={{ width: '100%', height: 'auto' }}
                  />
                </div>
              )}
            </div>
            {/* Name + Location */}
            <div className="flex-1 mb-2 py-2">
              <h2 className="text-xl text-[#191818] md:text-2xl font-bold">
                {([name, lastName].filter(Boolean).join(' ') || 'Your Name')}
              </h2>
              <h6 className="text-md font-bold text-[#D4AA25]">Travel agent</h6>
              <p className="text-sm text-[#404040] md:text-base flex items-center gap-1 mt-1">
                <MapPin className="h-4 w-4" />
                {profile?.country && profile?.city
                  ? `${profile.city}, ${profile.country}`
                  : profile?.country || profile?.city || 'Location not specified'}
              </p>
            </div>

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

      <div className="py-8 md:py-12">

        <Card className="border shadow-md px-5 rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg md:text-xl">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between mt-3 gap-10">
              <div className="flex gap-2">
                <Image src={cartIcon} alt="cart" />
                <div>
                  <h6 className="text-sm text-[#000000]">Phone Number</h6>
                  <p className="text-md font-semibold text-[#000000]">+{userInfo?.phone}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Image src={cartIcon} alt="cart" />
                <div>
                  <h6 className="text-sm text-[#000000]">Email</h6>
                  <p className="text-md font-semibold text-[#000000]">{profile?.contact_email}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Image src={cartIcon} alt="cart" />
                <div>
                  <h6 className="text-sm text-[#000000]">Website</h6>
                  <p className="text-md font-semibold text-[#000000]">{profile?.website}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
