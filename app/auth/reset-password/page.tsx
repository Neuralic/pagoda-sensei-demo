// "use client";

// import { useState } from "react";
// import Image from "next/image";
// import Link from "next/link";
// import authImage from "../../../public/assets/images/auth.jpg";
// import Logo from "../../../public/assets/images/logo.svg";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";

// export default function ResetPasswordPage() {
//   const [email, setEmail] = useState("");

//   function onSubmit(e: React.FormEvent) {
//     e.preventDefault();
//     console.log("reset request for", email);
//     // TODO: call password reset endpoint
//   }

//   return (
//     <div className="flex min-h-screen p-4 flex-col bg-[#F9FAFB] lg:flex-row">
//       {/* Left hero image */}
//       <div className="relative hidden h-72 sm:h-96 w-full overflow-hidden rounded-3xl lg:block lg:h-auto lg:w-2/5">
//         <Image
//           src={authImage}
//           alt="Mount Fuji with pagoda"
//           fill
//           className="object-cover"
//           sizes="(min-width: 1024px) 40vw, 100vw"
//         />
//         <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/40 to-transparent p-6 sm:p-8 text-white">
//           <h2 className="text-3xl sm:text-4xl font-bold">
//             Create Trip Itineraries with Ease
//           </h2>
//           <p className="mt-2 text-sm text-white/80">
//             Build multi-day trip plans using our drag-and-drop itinerary
//             builder. Add destinations, activities, notes, and timeline — all in
//             one place.
//           </p>
//         </div>
//       </div>

//       {/* Right form panel */}
//       <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-8 lg:px-16">
//         <div className="flex justify-center">
//           <Image
//             src={Logo}
//             alt="Pagoda.travel"
//             className="h-auto w-[120px] sm:w-[146px] absolute top-6 sm:top-8 left-0 right-0 mx-auto"
//           />
//         </div>

//         <div className="w-full max-w-md space-y-6 text-center">
//           <h1 className="mt-6 text-2xl sm:text-3xl font-semibold text-gray-900">
//             Forgot your password?
//           </h1>
//           <p className="text-sm text-gray-600">
//             No problem, enter your email address and we will send you the link
//           </p>

//           <form onSubmit={onSubmit} className="space-y-4">
//             <div>
//               <label htmlFor="email" className="sr-only">
//                 Email address
//               </label>
//               <Input
//                 id="email"
//                 name="email"
//                 type="email"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 placeholder="example@email.com"
//                 className="h-12 rounded-lg border border-gray-200 bg-white px-3 text-gray-900 placeholder:text-gray-400"
//               />
//             </div>

//             <div>
//               <Button
//                 type="submit"
//                 className="h-12 w-full rounded bg-[#D4AA25] text-white"
//               >
//                 Reset Password
//               </Button>
//             </div>

//             <p className="text-sm text-gray-600">
//               <Link
//                 href="/auth/login"
//                 className="text-gray-600 hover:underline"
//               >
//                 Back to Login
//               </Link>
//             </p>
//           </form>
//         </div>
//       </div>
//     </div>
//   );
// }

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import authImage from "../../../public/assets/images/auth.jpg";
import Logo from "../../../public/assets/images/pagodalogo.jpg";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export default function ResetPasswordPage() {
  const [step, setStep] = useState<"request" | "verify" | "reset">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // OTP verification state
  const length = 6;
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const router = useRouter();

  // Prefill email from query params if available
  useEffect(() => {
    const sp =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const em = sp?.get("email") || "";
    if (em) setEmail(em);

    // REMOVED: No more auto-fill from devCode
  }, [step]);

  // OTP input handlers (same as before)
  function handleChange(idx: number, v: string) {
    if (!v) {
      setValues((s) => {
        const copy = [...s];
        copy[idx] = "";
        return copy;
      });
      return;
    }

    const char = v.slice(-1).replace(/[^0-9]/g, "");
    if (!char) return;

    setValues((s) => {
      const copy = [...s];
      copy[idx] = char;
      return copy;
    });

    const next = inputsRef.current[idx + 1];
    if (next) next.focus();
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number
  ) {
    const key = e.key;
    if (key === "Backspace" && !values[idx]) {
      const prev = inputsRef.current[idx - 1];
      if (prev) prev.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text/plain");
    const digits = pastedData.replace(/\D/g, "").split("").slice(0, length);

    if (digits.length > 0) {
      const newValues = [...values];

      digits.forEach((digit, index) => {
        if (index < length) {
          newValues[index] = digit;
        }
      });

      for (let i = digits.length; i < length; i++) {
        newValues[i] = "";
      }

      setValues(newValues);

      const nextEmptyIndex =
        digits.length < length ? digits.length : length - 1;
      setTimeout(() => {
        inputsRef.current[nextEmptyIndex]?.focus();
      }, 0);
    }
  }

  // Step 1: Request password reset
  async function onRequestReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address.");
      return;
    }

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reset code");

      toast.success("Reset code sent to your email. Please check your inbox.");
      setStep("verify");

      // Start cooldown
      setCooldown(30);
      const interval = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            return 0;
          }
          return c - 1;
        });
      }, 1000);

      // REMOVED: No more auto-fill logic
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send reset code";
      toast.error(message);
    }
  }

  // Step 2: Verify reset code
  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const code = values.join("");
    if (code.length < length) {
      toast.error("Please enter the full 6-digit code.");
      return;
    }

    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");

      setToken(data.token);
      setStep("reset");
      toast.success("Code verified. Please set your new password.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      toast.error(message);
    }
  }

  // Step 3: Reset password with new password
  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error("Please enter and confirm your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");

      toast.success(
        "Password reset successfully. You can now login with your new password."
      );
      router.push("/auth/login");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to reset password";
      toast.error(message);
    }
  }

  // Resend verification code
  async function onResendCode() {
    if (!email) {
      toast.error("Missing email.");
      return;
    }

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend code");

      toast.success("Code sent. Please check your email.");

      setCooldown(30);
      const interval = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to resend code";
      toast.error(message);
    }
  }

  return (
    <div className="flex min-h-screen p-4 flex-col bg-[#F9FAFB] lg:flex-row">
      {/* Left hero image */}
      <div className="relative hidden h-72 sm:h-96 w-full overflow-hidden rounded-3xl lg:block lg:h-auto lg:w-2/5">
        <Image
          src={authImage}
          alt="Mount Fuji with pagoda"
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 40vw, 100vw"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/40 to-transparent p-6 sm:p-8 text-white">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Create Trip Itineraries with Ease
          </h2>
          <p className="mt-2 text-sm text-white/80">
            Build multi-day trip plans using our drag-and-drop itinerary
            builder. Add destinations, activities, notes, and timeline — all in
            one place.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-8 lg:px-16">
        <div className="flex justify-center">
          <Image
            src={Logo}
            alt="Pagoda.travel"
            className="h-auto w-[120px] sm:w-[146px] absolute top-6 sm:top-8 left-0 right-0 mx-auto"
          />
        </div>

        <div className="w-full max-w-md space-y-6 text-center">
          {/* Step 1: Request Reset */}
          {step === "request" && (
            <>
              <h1 className="mt-6 text-2xl sm:text-3xl font-semibold text-gray-900">
                Forgot your password?
              </h1>
              <p className="text-sm text-gray-600">
                Enter your email address and we&apos;ll send you a verification
                code to reset your password.
              </p>

              <form onSubmit={onRequestReset} className="space-y-4">
                <div>
                  <label htmlFor="email" className="sr-only">
                    Email address
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="h-12 rounded-lg border border-gray-200 bg-white px-3 text-gray-900 placeholder:text-gray-400"
                  />
                </div>

                <div>
                  <Button
                    type="submit"
                    className="h-12 w-full rounded bg-[#D4AA25] text-white"
                  >
                    Send Reset Code
                  </Button>
                </div>

                <p className="text-sm text-gray-600">
                  <Link
                    href="/auth/login"
                    className="text-gray-600 hover:underline"
                  >
                    Back to Login
                  </Link>
                </p>
              </form>
            </>
          )}

          {/* Step 2: Verify Code */}
          {step === "verify" && (
            <>
              <h1 className="mt-6 text-2xl sm:text-3xl font-semibold text-gray-900">
                Check Your Email
              </h1>
              <p className="text-sm text-gray-600">
                We sent a 6-digit code to <b>{email}</b>. Please check your
                email and enter the code below.
              </p>

              <form onSubmit={onVerifyCode} className="space-y-4">
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  {Array.from({ length }).map((_, i) => (
                    <div key={i} className="flex items-center">
                      <input
                        ref={(el) => {
                          inputsRef.current[i] = el;
                        }}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={values[i]}
                        onChange={(e) => handleChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, i)}
                        onPaste={handlePaste}
                        className="h-12 w-10 sm:w-12 rounded border border-gray-200 bg-white text-center text-lg font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D4AA25]"
                      />
                      {i === 2 && (
                        <span className="mx-1 sm:mx-2 ml-3 sm:ml-5 text-2xl font-medium text-gray-400">
                          -
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  <Button
                    type="submit"
                    className="h-12 w-full rounded bg-[#D4AA25] text-white"
                  >
                    Verify Code
                  </Button>
                </div>

                <p className="text-sm text-gray-600">
                  Didn&apos;t receive the code?{" "}
                  <button
                    type="button"
                    onClick={onResendCode}
                    disabled={cooldown > 0}
                    className="font-semibold text-[#D4AA25] hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
                  </button>
                </p>

                <p className="text-sm text-gray-600">
                  <button
                    type="button"
                    onClick={() => setStep("request")}
                    className="text-gray-600 hover:underline"
                  >
                    Back to Email Entry
                  </button>
                </p>
              </form>
            </>
          )}

          {/* Step 3: Reset Password */}
          {step === "reset" && (
            <>
              <h1 className="mt-6 text-2xl sm:text-3xl font-semibold text-gray-900">
                Set New Password
              </h1>
              <p className="text-sm text-gray-600">
                Enter your new password below
              </p>

              <form onSubmit={onResetPassword} className="space-y-4">
                <div>
                  <label htmlFor="newPassword" className="sr-only">
                    New Password
                  </label>
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="h-12 rounded-lg border border-gray-200 bg-white px-3 text-gray-900 placeholder:text-gray-400"
                    minLength={6}
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="sr-only">
                    Confirm Password
                  </label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="h-12 rounded-lg border border-gray-200 bg-white px-3 text-gray-900 placeholder:text-gray-400"
                    minLength={6}
                  />
                </div>

                <div>
                  <Button
                    type="submit"
                    className="h-12 w-full rounded bg-[#D4AA25] text-white"
                  >
                    Reset Password
                  </Button>
                </div>

                <p className="text-sm text-gray-600">
                  <button
                    type="button"
                    onClick={() => setStep("verify")}
                    className="text-gray-600 hover:underline"
                  >
                    Back to Code Verification
                  </button>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
