"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Phone } from "lucide-react";
import Image from "next/image";
import avatar from "../../public/assets/images/profile/avatar.png";
import backgroundImage from "../../public/assets/images/profile/placeholder.svg";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";

type AgentProfileHeaderProps = {
  profile?: {
    profile_picture_path?: string | null;
  } | null | undefined;
  name?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

export function AgentProfileHeader({ 
  profile, 
  name: nameProp, 
  lastName: lastNameProp,
  email,
  phone 
}: AgentProfileHeaderProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [name, setName] = useState<string>(nameProp ?? "");
  const [lastName, setLastName] = useState<string>(lastNameProp ?? "");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (profile?.profile_picture_path) {
          const res = await getSignedUrls([{ bucket: BUCKETS.avatars, path: profile.profile_picture_path }]);
          if (!cancelled) setAvatarUrl(res[0]?.signedUrl || res[0]?.publicUrl || null);
        } else {
          setAvatarUrl(null);
        }
      } catch {
        if (!cancelled) {
          setAvatarUrl(null);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [profile?.profile_picture_path]);

  // If name props change, update displayed values
  useEffect(() => {
    if (typeof nameProp === 'string') setName(nameProp);
    if (typeof lastNameProp === 'string') setLastName(lastNameProp);
  }, [nameProp, lastNameProp]);

  return (
    <div className="w-full bg-white rounded-lg shadow-sm overflow-hidden border">
      {/* PROFILE INFO SECTION */}
      <div className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* Logo */}
          <div className="relative z-10 flex-shrink-0 flex items-center justify-center" style={{ maxWidth: '160px' }}>
            {avatarUrl ? (
              <div style={{ width: '100%', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image 
                  src={avatarUrl} 
                  alt="Agent logo" 
                  width={0}
                  height={0}
                  sizes="(max-width: 768px) 128px, 160px"
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
                  sizes="(max-width: 768px) 128px, 160px"
                  className="object-contain" 
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
            )}
          </div>
          
          {/* Name + Contact Info */}
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              {([name, lastName].filter(Boolean).join(' ') || 'Agent Name')}
            </h2>
            
            <div className="space-y-3">
              {email && (
                <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                  <Mail className="h-5 w-5" />
                  <a href={`mailto:${email}`} className="text-sm md:text-base hover:text-[#D4AA25] transition-colors">
                    {email}
                  </a>
                </div>
              )}
              
              {phone && (
                <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                  <Phone className="h-5 w-5" />
                  <a href={`tel:${phone}`} className="text-sm md:text-base hover:text-[#D4AA25] transition-colors">
                    {phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Message Button */}
          <Button 
            className="bg-[#D4AA25] hover:bg-[#D4AA25]/90 text-white rounded-lg px-6 py-6 shadow-md hover:shadow-lg transition cursor-pointer flex-shrink-0"
          >
            💬 Message me
          </Button>
        </div>
      </div>
    </div>
  );
}