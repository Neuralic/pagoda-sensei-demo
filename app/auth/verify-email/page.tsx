// "use client";

// import { useEffect, useRef, useState } from "react";
// import Image from "next/image";
// import Link from "next/link";
// import { useRouter } from "next/navigation";

// import authImage from "../../../public/assets/images/auth.jpg";
// import Logo from "../../../public/assets/images/logo.svg";

// import { Button } from "@/components/ui/button";
// import toast from "react-hot-toast";

// export default function VerifyEmailPage() {
//   const length = 6;
//   const [values, setValues] = useState<string[]>(Array(length).fill(""));
//   const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
//   const [email, setEmail] = useState("");
//   const router = useRouter();
//   const [cooldown, setCooldown] = useState(0);

//   useEffect(() => {
//     const sp =
//       typeof window !== "undefined"
//         ? new URLSearchParams(window.location.search)
//         : null;
//     const em = sp?.get("email") || "";
//     setEmail(em);
//     const devCode = sp?.get("devCode") || "";
//     if (devCode && devCode.length === length) {
//       // prefill inputs in dev mode
//       setValues(devCode.split(""));
//     }
//   }, []);

//   function handleChange(idx: number, v: string) {
//     if (!v) {
//       setValues((s) => {
//         const copy = [...s];
//         copy[idx] = "";
//         return copy;
//       });
//       return;
//     }

//     const char = v.slice(-1).replace(/[^0-9]/g, "");
//     if (!char) return;

//     setValues((s) => {
//       const copy = [...s];
//       copy[idx] = char;
//       return copy;
//     });

//     // focus next
//     const next = inputsRef.current[idx + 1];
//     if (next) next.focus();
//   }

//   function handleKeyDown(
//     e: React.KeyboardEvent<HTMLInputElement>,
//     idx: number
//   ) {
//     const key = e.key;
//     if (key === "Backspace" && !values[idx]) {
//       const prev = inputsRef.current[idx - 1];
//       if (prev) prev.focus();
//     }
//   }

//   async function onVerify(e: React.FormEvent) {
//     e.preventDefault();
//     const code = values.join("");
//     if (code.length < length) {
//       toast.error("Please enter the full code.");
//       return;
//     }
//     try {
//       const res = await fetch("/api/auth/verify", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email, code }),
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || "Verification failed");
//       toast.success("Email verified. You can now login.");
//       router.push("/auth/login");
//     } catch (err: unknown) {
//       const message =
//         err instanceof Error ? err.message : "Verification failed";
//       toast.error(message);
//     }
//   }

//   async function onResend() {
//     if (!email) {
//       toast.error("Missing email.");
//       return;
//     }
//     try {
//       const res = await fetch("/api/auth/resend", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email }),
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || "Failed to resend");
//       toast.success("Code sent.");
//       if (data?.devCode && process.env.NODE_ENV !== "production") {
//         // prefill with dev code
//         const codeStr = String(data.devCode);
//         if (codeStr.length === length) setValues(codeStr.split(""));
//         toast.success(`Dev code: ${data.devCode}`);
//       }
//       // start 30s cooldown
//       setCooldown(30);
//       const i = setInterval(() => {
//         setCooldown((c) => {
//           if (c <= 1) {
//             clearInterval(i);
//             return 0;
//           }
//           return c - 1;
//         });
//       }, 1000);
//     } catch (e: unknown) {
//       const message = e instanceof Error ? e.message : "Failed to resend";
//       toast.error(message);
//     }
//   }

//   return (
//     <div className="flex min-h-screen p-4 flex-col bg-[#F9FAFB] lg:flex-row">
//       {/* Left hero image */}
//       <div className="relative hidden h-72 w-full overflow-hidden rounded-3xl sm:h-96 lg:block lg:h-auto lg:w-2/5">
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
//             Verify your email
//           </h1>
//           <p className="text-sm text-gray-600">
//             We have sent a 6 digits code to{" "}
//             {email ? <b>{email}</b> : "your email"}. Please check your inbox and
//             input the code below to activate your account.
//           </p>

//           <form onSubmit={onVerify} className="space-y-4">
//             <div className="flex items-center justify-center gap-2 sm:gap-3">
//               {Array.from({ length }).map((_, i) => (
//                 <div key={i} className="flex items-center">
//                   <input
//                     ref={(el) => {
//                       inputsRef.current[i] = el;
//                     }}
//                     inputMode="numeric"
//                     pattern="[0-9]*"
//                     maxLength={1}
//                     value={values[i]}
//                     onChange={(e) => handleChange(i, e.target.value)}
//                     onKeyDown={(e) => handleKeyDown(e, i)}
//                     className="h-12 w-10 sm:w-12 rounded border border-gray-200 bg-white text-center text-lg font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D4AA25]"
//                   />

//                   {i === 2 && (
//                     <span className="mx-1 sm:mx-2 ml-3 sm:ml-5 text-2xl font-medium text-gray-400">
//                       -
//                     </span>
//                   )}
//                 </div>
//               ))}
//             </div>

//             <div>
//               <Button
//                 type="submit"
//                 className="h-12 w-full rounded bg-[#D4AA25] text-white"
//               >
//                 Verify Email
//               </Button>
//             </div>

//             <p className="text-sm text-gray-600">
//               Didn&apos;t receive the code?{" "}
//               <button
//                 type="button"
//                 onClick={onResend}
//                 disabled={cooldown > 0}
//                 className="font-semibold text-[#D4AA25] hover:underline disabled:opacity-50 cursor-pointer"
//               >
//                 {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
//               </button>
//             </p>

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

import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { VERIFICATION_CODE_TTL_HOURS } from "@/lib/verification-code";

export default function VerifyEmailPage() {
  const length = 6;
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"guide" | "agent" | "">("");
  const router = useRouter();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const sp =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const em = sp?.get("email") || "";
    setEmail(em);
    const roleParam = sp?.get("role") || "";
    if (roleParam === "guide" || roleParam === "agent") {
      setRole(roleParam);
    }
    const devCode = sp?.get("devCode") || "";
    if (devCode && devCode.length === length) {
      // prefill inputs in dev mode
      setValues(devCode.split(""));
    }
  }, []);

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

    // focus next
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
    const pastedData = e.clipboardData.getData('text/plain');
    const digits = pastedData.replace(/\D/g, '').split('').slice(0, length);

    if (digits.length > 0) {
      const newValues = [...values];
      
      // Fill all values with pasted digits
      digits.forEach((digit, index) => {
        if (index < length) {
          newValues[index] = digit;
        }
      });

      // Fill remaining slots with empty strings if pasted data is shorter
      for (let i = digits.length; i < length; i++) {
        newValues[i] = "";
      }

      setValues(newValues);

      // Focus the next empty input or the last input
      const nextEmptyIndex = digits.length < length ? digits.length : length - 1;
      setTimeout(() => {
        inputsRef.current[nextEmptyIndex]?.focus();
      }, 0);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = values.join("");
    if (code.length < length) {
      toast.error("Please enter the full code.");
      return;
    }
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, ...(role ? { role } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      toast.success("Email verified. You can now login.");
      const verifiedRole = data?.role === "agent" || data?.role === "guide" ? data.role : role;
      const loginPath =
        verifiedRole === "agent" ? "/agent/login" : "/guide/login";
      router.push(`${loginPath}?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      toast.error(message);
    }
  }

  async function onResend() {
    if (!email) {
      toast.error("Missing email.");
      return;
    }
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...(role ? { role } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend");
      toast.success("Code sent.");
      if (data?.devCode && process.env.NODE_ENV !== "production") {
        // prefill with dev code
        const codeStr = String(data.devCode);
        if (codeStr.length === length) setValues(codeStr.split(""));
        toast.success(`Dev code: ${data.devCode}`);
      }
      // start 30s cooldown
      setCooldown(30);
      const i = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(i);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to resend";
      toast.error(message);
    }
  }

  return (
    <div className="flex min-h-screen p-4 flex-col bg-[#F9FAFB] lg:flex-row">
      {/* Left hero image */}
      <div className="relative hidden h-72 w-full overflow-hidden rounded-3xl sm:h-96 lg:block lg:h-auto lg:w-2/5">
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
          <h1 className="mt-6 text-2xl sm:text-3xl font-semibold text-gray-900">
            Verify your email
          </h1>
          <p className="text-sm text-gray-600">
            We have sent a 6 digits code to{" "}
            {email ? <b>{email}</b> : "your email"}. Please check your inbox and
            input the code below to activate your account. Codes expire after{" "}
            {VERIFICATION_CODE_TTL_HOURS} hours — use Resend Code if yours expired.
          </p>
          <p className="text-xs text-gray-500">
            After login you can save your guide profile as a draft in Settings while you complete photo and certification fields.
          </p>

          <form onSubmit={onVerify} className="space-y-4">
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
                Verify Email
              </Button>
            </div>

            <p className="text-sm text-gray-600">
              Didn&apos;t receive the code?{" "}
              <button
                type="button"
                onClick={onResend}
                disabled={cooldown > 0}
                className="font-semibold text-[#D4AA25] hover:underline disabled:opacity-50 cursor-pointer"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
              </button>
            </p>

            <p className="text-sm text-gray-600">
              <Link
                href="/guide/login"
                className="text-gray-600 hover:underline"
              >
                Back to Login
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}