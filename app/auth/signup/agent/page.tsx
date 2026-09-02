"use client";

import Image from "next/image";
import authImage from "../../../../public/assets/images/auth.jpg";
import SignupForm from "@/components/auth/SignupForm";

export default function AgencySignupPage() {
  return (
    <div className="flex min-h-screen p-4 flex-col bg-white lg:flex-row">
      <div className="relative hidden h-72 sm:h-96 w-full overflow-hidden rounded-3xl lg:block lg:h-auto lg:w-2/5">
        <Image
          src={authImage}
          alt="Mount Fuji with pagoda"
          fill
          priority
          className="object-cover rounded-3xl "
          sizes="(min-width: 1024px) 40vw, 100vw"
        />
        <div className="absolute inset-x-0 bottom-0 space-y-4 bg-gradient-to-t from-black via-black/40 to-transparent p-10 text-white">
          <div className="space-y-2 p-10 pb-14">
            <h2 className="text-5xl font-bold leading-tight">
              Create Itineraries With Ease
            </h2>
            <p className="text-sm text-white/80">
              Build multi-day trip plans using our drag-and-drop itinerary
              builder. Add destinations, activities, notes, and timeline — all
              in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Hero Section */}
      <div className="relative h-48 sm:h-56 lg:hidden w-full overflow-hidden rounded-b-3xl">
        <Image
          src={authImage}
          alt="Mount Fuji with pagoda"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/40 to-transparent p-6 text-white">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
              Create Itineraries With Ease
            </h2>
            <p className="text-xs sm:text-sm text-white/80 line-clamp-2">
              Build multi-day trip plans using our drag-and-drop itinerary
              builder.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center relative justify-center px-6 lg:px-16">
        <SignupForm variant="agent" />
      </div>
    </div>
  );
}
