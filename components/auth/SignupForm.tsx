// "use client";

// import { useMemo, useState } from "react";
// import Image from "next/image";
// import { Eye, EyeOff, Lock, Mail, Phone, User, MapPin } from "lucide-react";
// import Link from "next/link";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import Logo from "../../public/assets/images/logo.svg";
// import toast from "react-hot-toast";
// import { useRouter } from "next/navigation";
// import countries from "world-countries";
// type Props = {
//   variant?: "agent" | "guide";
// };

// export default function SignupForm({ variant = "agent" }: Props) {
//   const router = useRouter();
//   const [showPassword, setShowPassword] = useState(false);
//   const [form, setForm] = useState({
//     firstName: "",
//     lastName: "",
//     email: "",
//     phone: "",
//     country: "",
//     city: "",
//     password: "",
//     remember: false,
//     acceptTerms: false,
//   });
//   const isAgency = variant === "agent";
//   const [errors, setErrors] = useState<Record<string, string>>({});
//   function update<K extends keyof typeof form>(
//     key: K,
//     value: (typeof form)[K]
//   ) {
//     setForm((s) => ({ ...s, [key]: value }));
//     setErrors((e) => ({ ...e, [String(key)]: "" }));
//   }

//   type CountryOption = { code: string; name: string };
//   const hasCommon = (v: unknown): v is { common: unknown } =>
//     typeof v === "object" &&
//     v !== null &&
//     Object.prototype.hasOwnProperty.call(v, "common");

//   const countryOptions = useMemo<CountryOption[]>(() => {
//     try {
//       const list = (countries as unknown as Array<Record<string, unknown>>)
//         .map((c): CountryOption | null => {
//           const codeRaw = (c["cca2"] ?? c["code"] ?? c["alpha2"]) as unknown;
//           const code = typeof codeRaw === "string" ? codeRaw.toLowerCase() : "";
//           const nameObj = c["name"] as unknown;
//           const name = hasCommon(nameObj)
//             ? String(nameObj.common ?? "")
//             : typeof nameObj === "string"
//             ? nameObj
//             : "";
//           if (!code || !name) return null;
//           return { code, name: String(name) };
//         })
//         .filter((v): v is CountryOption => Boolean(v))
//         .sort((a, b) => a.name.localeCompare(b.name));
//       return list;
//     } catch {
//       return [
//         { code: "jp", name: "Japan" },
//         { code: "fr", name: "France" },
//         { code: "us", name: "United States" },
//       ];
//     }
//   }, []);

//   async function onSubmit(e: React.FormEvent) {
//     e.preventDefault();

//     const newErrors: Record<string, string> = {};
//     if (!form.firstName.trim()) newErrors.firstName = "First name is required.";
//     if (!form.lastName.trim()) newErrors.lastName = "Last name is required.";
//     if (!form.email.trim()) newErrors.email = "Email is required.";
//     else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
//       newErrors.email = "Please enter a valid email address.";
//     if (!form.phone.trim()) newErrors.phone = "Phone is required.";
//     if (!form.country) newErrors.country = "Please select a country.";
//     if (!form.city.trim()) newErrors.city = "City is required.";
//     if (!form.password) newErrors.password = "Password is required.";
//     if (!form.acceptTerms)
//       newErrors.acceptTerms = "You must accept the Terms to continue.";

//     if (Object.keys(newErrors).length) {
//       setErrors(newErrors);
//       toast.error("Please fix the highlighted fields.", {
//         duration: 4000,
//       });
//       return;
//     }

//     try {
//       const res = await fetch("/api/auth/register", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           firstName: form.firstName,
//           lastName: form.lastName,
//           email: form.email,
//           phone: form.phone,
//           country: form.country,
//           city: form.city,
//           password: form.password,
//           role: variant,
//           remember: form.remember,
//           acceptTerms: form.acceptTerms,
//         }),
//       });

//       const data = await res.json();

//       if (!res.ok) {
//         // Don't throw an error, just handle it directly
//         if (res.status === 409) {
//           const errorMessage =
//             "This email is already registered. Please use a different email or try logging in.";
//           setErrors((prev) => ({ ...prev, email: errorMessage }));
//           toast.error(`${errorMessage}`, {
//             duration: 6000,
//             style: {
//               background: "#fef2f2",
//               border: "1px solid #fecaca",
//               color: "#dc2626",
//             },
//           });

//           // Clear the email field
//           setForm((prev) => ({ ...prev, email: "" }));

//           // Show login suggestion
//           setTimeout(() => {
//             toast("💡 Already have an account?", {
//               duration: 5000,
//             });
//             router.push("/auth/login");
//           }, 2000);
//           return; // Important: return here to stop execution
//         } else if (res.status === 400) {
//           const errorMessage =
//             data.error || "Please check your information and try again.";
//           toast.error(`${errorMessage}`, {
//             duration: 5000,
//           });
//         } else {
//           const errorMessage =
//             data.error || "Registration failed. Please try again.";
//           toast.error(`${errorMessage}`, {
//             duration: 5000,
//           });
//         }
//         return; // Return for all error cases
//       }

//       // If we get here, registration was successful
//       toast.success(
//         "🎉 Account created successfully! Check your email for the verification code.",
//         {
//           duration: 6000,
//           icon: "✅",
//         }
//       );

//       const q = new URLSearchParams({ email: form.email });
//       if (data?.devCode && process.env.NODE_ENV !== "production") {
//         q.set("devCode", String(data.devCode));
//         toast.success(`🔐 Development code: ${data.devCode}`, {
//           duration: 8000,
//         });
//       }

//       router.push(`/auth/verify-email?${q.toString()}`);
//     } catch (err: unknown) {
//       // This catch block is for network errors or other exceptions
//       const message =
//         err instanceof Error ? err.message : "Registration failed";

//       toast.error(`${message}`, {
//         duration: 5000,
//         style: {
//           background: "#fef2f2",
//           border: "1px solid #fecaca",
//           color: "#dc2626",
//         },
//       });

//       console.error("Registration error:", err);
//     } finally {
//     }
//   }

//   return (
//     <div className="w-full max-w-[560px] sm:p-6 md:p-8">
//       <div className="flex justify-center">
//         <Image
//           src={Logo}
//           alt="Pagoda.travel"
//           className="h-auto w-[120px] sm:w-[146px] absolute top-6 sm:top-8 left-0 right-0 mx-auto"
//         />
//       </div>
//       <h1 className="text-center text-2xl sm:text-3xl font-semibold text-gray-900">
//         {variant === "guide"
//           ? "Register as Tour Guide"
//           : "Register as Travel Agent"}
//       </h1>
//       <form onSubmit={onSubmit} className="mt-4 space-y-6">
//         <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
//           <div>
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               First name
//             </label>
//             <div className="relative mt-3">
//               <span className="absolute left-3 inset-y-0 flex items-center">
//                 <User className="h-5 w-5 text-gray-400" />
//               </span>
//               <Input
//                 value={form.firstName}
//                 onChange={(e) => update("firstName", e.target.value)}
//                 placeholder="Daniel"
//                 className="h-10 pl-10"
//                 aria-invalid={Boolean(errors.firstName)}
//               />
//             </div>
//             {errors.firstName && (
//               <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>
//             )}
//           </div>

//           <div>
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               Last name
//             </label>
//             <div className="relative mt-3">
//               <span className="absolute left-3 inset-y-0 flex items-center">
//                 <User className="h-5 w-5 text-gray-400" />
//               </span>
//               <Input
//                 value={form.lastName}
//                 onChange={(e) => update("lastName", e.target.value)}
//                 placeholder="Newman"
//                 className="h-10 pl-10"
//                 aria-invalid={Boolean(errors.lastName)}
//               />
//             </div>
//             {errors.lastName && (
//               <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>
//             )}
//           </div>
//         </div>

//         <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
//           <div>
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               Email
//             </label>
//             <div className="relative mt-3">
//               <span className="absolute left-3 inset-y-0 flex items-center">
//                 <Mail className="h-5 w-5 text-gray-400" />
//               </span>
//               <Input
//                 value={form.email}
//                 onChange={(e) => update("email", e.target.value)}
//                 type="email"
//                 placeholder="example@email.com"
//                 className="h-10 pl-10"
//                 aria-invalid={Boolean(errors.email)}
//               />
//             </div>
//             {errors.email && (
//               <p className="text-sm text-red-600 mt-1">{errors.email}</p>
//             )}
//           </div>

//           <div>
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               Phone
//             </label>
//             <div className="relative mt-3">
//               <span className="absolute left-3 inset-y-0 flex items-center">
//                 <Phone className="h-5 w-5 text-gray-400" />
//               </span>
//               <Input
//                 value={form.phone}
//                 onChange={(e) => update("phone", e.target.value)}
//                 placeholder="432864312"
//                 className="h-10 pl-10"
//                 aria-invalid={Boolean(errors.phone)}
//               />
//             </div>
//             {errors.phone && (
//               <p className="text-sm text-red-600 mt-1">{errors.phone}</p>
//             )}
//           </div>
//         </div>

//         <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
//           <div>
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               Country
//             </label>
//             <select
//               value={form.country}
//               onChange={(e) => update("country", e.target.value)}
//               className="h-10 w-full rounded border border-gray-200 bg-white px-3 text-sm shadow-sm"
//               aria-invalid={Boolean(errors.country)}
//             >
//               <option value="">Select a country</option>
//               {countryOptions.map((c) => (
//                 <option key={c.code} value={c.code}>
//                   {c.name}
//                 </option>
//               ))}
//             </select>
//             {errors.country && (
//               <p className="text-sm text-red-600 mt-1">{errors.country}</p>
//             )}
//           </div>

//           <div>
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               City
//             </label>
//             <div className="relative mt-3">
//               <span className="absolute left-3 inset-y-0 flex items-center">
//                 <MapPin className="h-5 w-5 text-gray-400" />
//               </span>
//               <Input
//                 value={form.city}
//                 onChange={(e) => update("city", e.target.value)}
//                 placeholder="Paris"
//                 className="h-10 pl-10"
//                 aria-invalid={Boolean(errors.city)}
//               />
//             </div>
//             {errors.city && (
//               <p className="text-sm text-red-600 mt-1">{errors.city}</p>
//             )}
//           </div>
//         </div>

//         <div>
//           <label className="mb-2 block text-sm font-medium text-gray-700">
//             Password
//           </label>
//           <div className="relative mt-3">
//             <span className="absolute left-3 inset-y-0 flex items-center">
//               <Lock className="h-5 w-5 text-gray-400" />
//             </span>
//             <Input
//               value={form.password}
//               onChange={(e) => update("password", e.target.value)}
//               type={showPassword ? "text" : "password"}
//               placeholder="Create a password"
//               className="h-10 pl-10 pr-12"
//               aria-invalid={Boolean(errors.password)}
//             />
//             <button
//               type="button"
//               onClick={() => setShowPassword((s) => !s)}
//               className="absolute right-3 inset-y-0 flex items-center text-gray-500 cursor-pointer"
//               aria-label={showPassword ? "Hide password" : "Show password"}
//             >
//               {showPassword ? (
//                 <EyeOff className="h-4 w-4" />
//               ) : (
//                 <Eye className="h-4 w-4" />
//               )}
//             </button>
//           </div>

//           {errors.password && (
//             <p className="text-sm text-red-600 mt-1">{errors.password}</p>
//           )}
//         </div>

//         <div className="space-y-2 text-sm text-gray-700">
//           <label className="flex items-center justify-between">
//             <div className="flex items-center gap-2">
//               <input
//                 type="checkbox"
//                 checked={form.remember}
//                 onChange={(e) => update("remember", e.target.checked)}
//                 className="h-4 w-4 rounded border-gray-300 text-[#D4AA25] focus:ring-[#D4AA25]"
//               />
//               Remember me
//             </div>

//             <p className="text-center text-sm text-gray-600">
//               <Link
//                 href="/auth/reset-password"
//                 className="font-semibold text-[#D4AA25] hover:underline"
//               >
//                 Forgot your password?
//               </Link>
//             </p>
//           </label>

//           <label className="flex items-center gap-2">
//             <input
//               type="checkbox"
//               checked={form.acceptTerms}
//               onChange={(e) => update("acceptTerms", e.target.checked)}
//               className="h-4 w-4 rounded border-gray-300 text-[#D4AA25] focus:ring-[#D4AA25]"
//               aria-invalid={Boolean(errors.acceptTerms)}
//             />
//             <span>
//               By registering, I accept the Pagoda Travel&apos;s {" "}
//               <Link
//                 href={variant === "guide" ? "/terms/guide" : "/terms/agent"}
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 className="font-semibold text-[#D4AA25] hover:underline"
//               >
//                 Terms and Conditions
//               </Link>{" "}
//             </span>
//           </label>
//           {errors.acceptTerms && (
//             <p className="text-sm text-red-600 mt-1">{errors.acceptTerms}</p>
//           )}
//         </div>

//         <div>
//           <Button
//             type="submit"
//             className="h-8 w-full rounded bg-[#D4AA25] text-white"
//           >
//             Sign Up
//           </Button>
//         </div>

//         <p className="text-center text-sm text-gray-600">
//           or{" "}
//           <Link
//             href="/auth/login"
//             className="font-semibold text-[#D4AA25] hover:underline"
//           >
//             Login Instead
//           </Link>
//         </p>

//         <p className="text-center text-sm text-gray-600">
//           {!isAgency ? "Not a Tour Guide?" : "Not a Travel Agent?"}{" "}
//           <Link
//             href={isAgency ? "/auth/signup/guide" : "/auth/signup/agent"}
//             className="font-semibold text-[#D4AA25] hover:underline"
//           >
//             {isAgency ? "Sign-up as a Tour Guide" : "Sign-up as a Travel Agent"}
//           </Link>
//         </p>
//       </form>
//     </div>
//   );
// }







"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Lock, Mail, Phone, User, MapPin } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "../../public/assets/images/pagodalogo.jpg";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { CountrySelect } from "@/components/shared/country-select";

const RecaptchaField = dynamic(() => import("@/components/auth/RecaptchaField"), {
  ssr: false,
  loading: () => (
    <p className="text-sm text-gray-500">Loading verification…</p>
  ),
});

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

type Props = {
  variant?: "agent" | "guide";
  /** Tour operator / DMC — manages multiple guide profiles */
  isOperator?: boolean;
};

export default function SignupForm({ variant = "agent", isOperator = false }: Props) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    password: "",
    remember: false,
    acceptTerms: false,
  });
  const isAgency = variant === "agent";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaResetKey, setRecaptchaResetKey] = useState(0);

  const resetRecaptcha = () => {
    setRecaptchaToken(null);
    setRecaptchaResetKey((k) => k + 1);
  };

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((s) => ({ ...s, [key]: value }));
    setErrors((e) => ({ ...e, [String(key)]: "" }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    const newErrors: Record<string, string> = {};
    if (!form.firstName.trim()) newErrors.firstName = "First name is required.";
    if (!form.lastName.trim()) newErrors.lastName = "Last name is required.";
    if (!form.email.trim()) newErrors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Please enter a valid email address.";
    if (!form.phone.trim()) newErrors.phone = "Phone is required.";
    if (!form.country) newErrors.country = "Please select a country.";
    if (!form.city.trim()) newErrors.city = "City is required.";
    if (!form.password) newErrors.password = "Password is required.";
    if (!form.acceptTerms)
      newErrors.acceptTerms = "You must accept the Terms to continue.";

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      toast.error("Please fix the highlighted fields.", {
        duration: 4000,
      });
      setIsSubmitting(false);
      return;
    }

    if (process.env.NODE_ENV === "production" && !RECAPTCHA_SITE_KEY) {
      toast.error("Registration is temporarily unavailable. Please try again later.");
      setIsSubmitting(false);
      return;
    }

    if (RECAPTCHA_SITE_KEY && !recaptchaToken) {
      toast.error("Please complete the reCAPTCHA verification.");
      setIsSubmitting(false);
      return;
    }

    try {
      const normalizedEmail = form.email.trim().toLowerCase();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: normalizedEmail,
          phone: form.phone,
          country: form.country,
          city: form.city,
          password: form.password,
          role: variant,
          isOperator: variant === "guide" && isOperator,
          accountType: variant === "guide" && isOperator ? "operator" : variant,
          remember: form.remember,
          acceptTerms: form.acceptTerms,
          recaptchaToken: recaptchaToken ?? "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        resetRecaptcha();
        if (res.status === 409) {
          const conflictField =
            data?.field === "email" || data?.field === "name" || data?.field === "phone"
              ? data.field
              : "phone";
          const errorMessage =
            data?.error ||
            (conflictField === "email"
              ? "This email is already registered. Please log in instead."
              : conflictField === "name"
                ? "This name is already registered. Please log in instead."
                : "This phone number is already registered. Please log in instead.");

          if (conflictField === "name") {
            setErrors((prev) => ({
              ...prev,
              firstName: errorMessage,
              lastName: errorMessage,
            }));
          } else {
            setErrors((prev) => ({ ...prev, [conflictField]: errorMessage }));
          }

          toast.error(errorMessage, {
            duration: 6000,
            icon: null,
            style: {
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
            },
          });

          if (conflictField === "phone") {
            setForm((prev) => ({ ...prev, phone: "" }));
          } else if (conflictField === "email") {
            setForm((prev) => ({ ...prev, email: "" }));
          }

          setTimeout(() => {
            if (data?.needsVerification) {
              toast("Check your email for the verification code.", { duration: 5000 });
              router.push(
                `/auth/verify-email?email=${encodeURIComponent(normalizedEmail)}&role=${variant}`
              );
            } else {
              toast("Already have an account? Log in instead.", { duration: 5000 });
              router.push(variant === "guide" ? "/guide/login" : "/agent/login");
            }
          }, 2000);
          return;
        } else if (res.status === 400) {
          const errorMessage =
            data.error || "Please check your information and try again.";
          toast.error(`${errorMessage}`, {
            duration: 5000,
          });
        } else {
          const errorMessage =
            data.error || "Registration failed. Please try again.";
          toast.error(`${errorMessage}`, {
            duration: 5000,
          });
        }
        return;
      }

      // Handle successful registration
      if (variant === 'guide') {
        toast.success(
          isOperator
            ? "Tour operator account created! Check your email for the verification code and your guide number."
            : "Guide account created successfully! Check your email for verification code and your unique Guide Number.",
          {
            duration: 8000,
            icon: "✅",
          }
        );
      } else {
        toast.success(
          "Account created successfully! Check your email for the verification code.",
          {
            duration: 6000,
            icon: "✅",
          }
        );
      }

      const q = new URLSearchParams({
        email: normalizedEmail,
        role: variant,
      });
      if (data?.devVerificationCode && process.env.NODE_ENV !== "production") {
        q.set("devCode", String(data.devVerificationCode));
        toast.success(`Development verification code: ${data.devVerificationCode}`, {
          duration: 8000,
        });
      }

      router.push(`/auth/verify-email?${q.toString()}`);
    } catch (err: unknown) {
      resetRecaptcha();
      const message =
        err instanceof Error ? err.message : "Registration failed";

      toast.error(`${message}`, {
        duration: 5000,
        style: {
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
        },
      });

      console.error("Registration error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[560px] sm:p-6 md:p-8">
      <div className="flex justify-center">
        <Image
          src={Logo}
          alt="Pagoda.travel"
          className="h-auto w-[120px] sm:w-[146px] top-6 sm:top-8 left-0 right-0 mx-auto"
        />
      </div>
      <h1 className="text-center text-2xl sm:text-3xl font-semibold text-gray-900 mt-2">
        {variant === "guide"
          ? isOperator
            ? "Register as Tour Operator"
            : "Register as Tour Guide"
          : "Register as Travel Agent"}
      </h1>

      {variant === "guide" && isOperator && (
        <p className="mt-3 text-center text-sm text-gray-600">
          Team guides join through an invite link you send from your dashboard after signup.
        </p>
      )}

      {/* {variant === "guide" && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 text-center">
            <strong>Important:</strong> Upon registration, you will receive a unique Guide Number 
            via email that you&apos;ll use to apply for jobs. Please check your email and save this number securely.
          </p>
        </div>
      )} */}

      <form onSubmit={onSubmit} className="mt-4 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              First name
            </label>
            <div className="relative mt-3">
              <span className="absolute left-3 inset-y-0 flex items-center">
                <User className="h-5 w-5 text-gray-400" />
              </span>
              <Input
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                placeholder="Daniel"
                className="h-10 pl-10"
                aria-invalid={Boolean(errors.firstName)}
                disabled={isSubmitting}
              />
            </div>
            {errors.firstName && (
              <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Last name
            </label>
            <div className="relative mt-3">
              <span className="absolute left-3 inset-y-0 flex items-center">
                <User className="h-5 w-5 text-gray-400" />
              </span>
              <Input
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                placeholder="Newman"
                className="h-10 pl-10"
                aria-invalid={Boolean(errors.lastName)}
                disabled={isSubmitting}
              />
            </div>
            {errors.lastName && (
              <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="relative mt-3">
              <span className="absolute left-3 inset-y-0 flex items-center">
                <Mail className="h-5 w-5 text-gray-400" />
              </span>
              <Input
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                type="email"
                placeholder="example@email.com"
                className="h-10 pl-10"
                aria-invalid={Boolean(errors.email)}
                disabled={isSubmitting}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-red-600 mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Phone
            </label>
            <div className="relative mt-3">
              <span className="absolute left-3 inset-y-0 flex items-center">
                <Phone className="h-5 w-5 text-gray-400" />
              </span>
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="432864312"
                className="h-10 pl-10"
                aria-invalid={Boolean(errors.phone)}
                disabled={isSubmitting}
              />
            </div>
            {errors.phone && (
              <p className="text-sm text-red-600 mt-1">{errors.phone}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <CountrySelect
              label="Country"
              value={form.country}
              onChange={(country) => update("country", country)}
              required
              disabled={isSubmitting}
            />
            {errors.country && (
              <p className="text-sm text-red-600 mt-1">{errors.country}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              City
            </label>
            <div className="relative mt-3">
              <span className="absolute left-3 inset-y-0 flex items-center">
                <MapPin className="h-5 w-5 text-gray-400" />
              </span>
              <Input
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                placeholder="Paris"
                className="h-10 pl-10"
                aria-invalid={Boolean(errors.city)}
                disabled={isSubmitting}
              />
            </div>
            {errors.city && (
              <p className="text-sm text-red-600 mt-1">{errors.city}</p>
            )}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Password
          </label>
          <div className="relative mt-3">
            <span className="absolute left-3 inset-y-0 flex items-center">
              <Lock className="h-5 w-5 text-gray-400" />
            </span>
            <Input
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              className="h-10 pl-10 pr-12"
              aria-invalid={Boolean(errors.password)}
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 inset-y-0 flex items-center text-gray-500 cursor-pointer"
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={isSubmitting}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {errors.password && (
            <p className="text-sm text-red-600 mt-1">{errors.password}</p>
          )}
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          <label className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={(e) => update("remember", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#D4AA25] focus:ring-[#D4AA25]"
                disabled={isSubmitting}
              />
              Remember me
            </div>

            {/* <p className="text-center text-sm text-gray-600">
              <Link
                href="/auth/reset-password"
                className="font-semibold text-[#D4AA25] hover:underline"
              >
                Forgot your password?
              </Link>
            </p> */}
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.acceptTerms}
              onChange={(e) => update("acceptTerms", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#D4AA25] focus:ring-[#D4AA25]"
              aria-invalid={Boolean(errors.acceptTerms)}
              disabled={isSubmitting}
            />
            <span>
              By registering, I accept the Pagoda Travel&apos;s {" "}
              <Link
                href={variant === "guide" ? "/terms/guide" : "/terms/agent"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#D4AA25] hover:underline"
              >
                Terms and Conditions
              </Link>{" "}
            </span>
          </label>
          {errors.acceptTerms && (
            <p className="text-sm text-red-600 mt-1">{errors.acceptTerms}</p>
          )}
        </div>

        {RECAPTCHA_SITE_KEY ? (
          <div className="flex justify-center">
            <RecaptchaField
              key={recaptchaResetKey}
              siteKey={RECAPTCHA_SITE_KEY}
              onChange={setRecaptchaToken}
            />
          </div>
        ) : process.env.NODE_ENV !== "production" ? (
          <p className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            reCAPTCHA is not configured (set{" "}
            <code className="text-[11px]">NEXT_PUBLIC_RECAPTCHA_SITE_KEY</code> and{" "}
            <code className="text-[11px]">RECAPTCHA_SECRET_KEY</code>). Signup is unrestricted in
            development only.
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            className="h-8 w-full rounded bg-[#D4AA25] text-white"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating Account..." : "Sign Up"}
          </Button>
        </div>

        <p className="text-center text-sm text-gray-600">
          or{" "}
          <Link
            href={variant === "guide" ? "/guide/login" : "/agent/login"}
            className="font-semibold text-[#D4AA25] hover:underline"
          >
            Login Instead
          </Link>
        </p>

        {isAgency && (
          <p className="text-center text-sm text-gray-600">
            Running a guide team?{" "}
            <Link
              href="/auth/signup/operator"
              className="font-semibold text-[#D4AA25] hover:underline"
            >
              Sign up as a Tour Operator
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}