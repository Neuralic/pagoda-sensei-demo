"use client";

import Image from "next/image";
import authImage from "../../../../public/assets/images/auth.jpg";
import SignupForm from "@/components/auth/SignupForm";

export default function OperatorSignupPage() {
  return (
    <div className="flex min-h-screen p-4 flex-col bg-white lg:flex-row">
      <div className="relative hidden h-72 sm:h-96 w-full overflow-hidden rounded-3xl lg:block lg:h-auto lg:w-2/5">
        <Image
          src={authImage}
          alt="Pagoda travel"
          fill
          priority
          className="object-cover rounded-3xl"
          sizes="(min-width: 1024px) 40vw, 100vw"
        />
        <div className="absolute inset-x-0 bottom-0 space-y-4 bg-gradient-to-t from-black via-black/40 to-transparent p-10 text-white">
          <div className="space-y-2 p-10 pb-14">
            <h2 className="text-4xl font-bold leading-tight">Tour operator account</h2>
            <p className="text-sm text-white/80">
              Upload and manage your entire guide team from one dashboard.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 lg:px-16">
        <SignupForm variant="guide" isOperator />
      </div>
    </div>
  );
}
