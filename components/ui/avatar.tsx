// components/ui/avatar.tsx
"use client";

import Image from "next/image";
import * as React from "react";
import avatar from "../../public/assets/images/profile/avatar.png";

interface AvatarProps {
  children?: React.ReactNode;
  className?: string;
}

interface AvatarImageProps {
  src?: string;
  alt?: string;
  className?: string;
}

interface AvatarFallbackProps {
  children?: React.ReactNode;
  className?: string;
}

export function Avatar({ children, className = "" }: AvatarProps) {
  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`}
    >
      {children}
    </div>
  );
}

export function AvatarImage({ src, alt, className = "" }: AvatarImageProps) {
  return (
    <Image
      src={src ?? avatar}
      alt={alt ?? "User avatar"}
      height={100}
      width={100}
      className={`aspect-square h-full w-full object-cover ${className}`}
    />
  );
}

export function AvatarFallback({
  children,
  className = "",
}: AvatarFallbackProps) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-full bg-gray-100 ${className}`}
    >
      {children}
    </div>
  );
}
