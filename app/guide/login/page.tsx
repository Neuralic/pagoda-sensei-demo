"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import authImage from "../../../public/assets/images/auth.jpg";
import Logo from "../../../public/assets/images/pagodalogo.jpg";
import loginLogo from "../../../public/assets/images/pagodalogo.jpg";
import toast from "react-hot-toast";
import { getGuidePostLoginPath } from "@/lib/guide-post-login";
import { useRedirectIfAuthenticated } from "@/hooks/use-redirect-if-authenticated";
import { homePathForRole } from "@/lib/auth-home";

function isValidRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  const decoded = decodeURIComponent(path);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return false;
  return decoded.startsWith("/guide/") || decoded === "/settings";
}

function GuideLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const checkingSession = useRedirectIfAuthenticated({
    redirectTo,
    isValidRedirect,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please enter email and password.");
      toast.error("Please enter both email and password.", {
        duration: 4000,
      });
      return;
    }

    const loadingToast = toast.loading("🔄 Signing you in...", {});

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      toast.dismiss(loadingToast);

      if (!res.ok) {
        if (data?.needsVerification) {
          toast.loading("📧 Redirecting to email verification...", {
            duration: 2000,
          });
          router.replace(`/auth/verify-email?email=${encodeURIComponent(email)}`);
          return;
        }
        const errorMessage = data?.error || "Login failed.";
        setError(errorMessage);
        toast.error(`${errorMessage}`, {
          duration: 5000,
        });
        return;
      }

      const role = data?.role as string | undefined;
      toast.success("Login successful! Redirecting...", {
        duration: 3000,
      });

      const destination =
        role === "guide"
          ? getGuidePostLoginPath({
              guideApproved: data?.guideApproved !== false,
              redirectTo,
              isValidRedirect,
            })
          : homePathForRole(role);

      setTimeout(() => {
        router.replace(destination);
      }, 1000);
    } catch (err: unknown) {
      toast.dismiss(loadingToast);
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(message);
      toast.error(`${message}`, {
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4 text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen p-4 flex-col bg-white lg:flex-row">
      {/* Left hero image - Exactly as you had for large screens */}
      <div className="relative hidden h-72 w-full overflow-hidden rounded-3xl sm:h-96 lg:block lg:h-auto lg:w-2/5">
        <Image
          src={authImage}
          alt="Mount Fuji with pagoda"
          fill
          priority
          className="object-cover rounded-3xl"
          sizes="(min-width: 1024px) 40vw, 100vw"
        />
        <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black via-black/40 to-transparent p-6 sm:p-8 lg:p-10 text-white">
          <div className="space-y-2 lg:pb-14">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
              Get Discovered by hundreds of Agents
            </h2>
            <p className="text-sm text-white/80">
             
              Upload your favorite Tours, and communicate within this marketplace, and say goodbye to those pesky emails.
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Hero Section - Only for small screens */}
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
                Get Discovered by hundreds of Agents
            </h2>
            <p className="text-xs sm:text-sm text-white/80 line-clamp-2">
       
              Upload your favorite Tours, and communicate within this marketplace, and say goodbye to those pesky emails.
            </p>
          </div>
        </div>
      </div>

      {/* Right form panel - Exactly as you had for large screens */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-8 lg:px-10">
        {/* <div className="flex justify-center">
          <Image
            src={Logo}
            alt="Pagoda.travel"
            className="h-auto w-[120px] sm:w-[146px] absolute top-6 sm:top-8 left-0 right-0 mx-auto"
          />
        </div> */}

        <div className="flex flex-col items-center w-full space-y-1 lg:space-y-3 mt-2 lg:mt-10 px-0 lg:px-32 ">
          <div className="text-center space-y-1 lg:space-y-2">
            <div className="flex items-center justify-center min-h-[80px] sm:min-h-[100px]">
              <Image
                src={loginLogo}
                alt="Pagoda.travel"
                className="h-[42px] w-[240px] sm:h-[57px] sm:w-[326px]"
              />
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">
             Tour Guide Login
            </h1>
          </div>

          <form className="space-y-6 w-full max-w-[522px]" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-gray-700"
              >
                Email address
              </label>

              <div className="relative mt-3">
                <span className="absolute left-3 inset-y-0 flex items-center">
                  <Mail className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </span>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-10 rounded-lg border-gray-200 bg-white pl-10 text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label
                htmlFor="password"
                className="text-sm font-medium text-gray-700"
              >
                Password
              </label>

              <div className="relative mt-3">
                <span className="absolute left-3 inset-y-0 flex items-center">
                  <Lock className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </span>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-10 rounded-lg border-gray-200 bg-white pl-10 pr-12 text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 inset-y-0 flex items-center text-gray-500 transition hover:text-gray-700 cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="remember"
                  className="h-4 w-4 rounded border-gray-300 text-[#D4AA25] focus:ring-[#D4AA25]"
                />
                Remember me
              </label>
              <Link
                href="/auth/reset-password"
                className="font-medium text-[#D4AA25] hover:underline"
              >
                Forgot your Password?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-8 w-full rounded bg-[#D4AA25] text-base font-semibold text-white shadow-sm transition hover:bg-[#D4AA25] disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-600 flex gap-4">
            <Link
              href="/agent/login"
              className="font-semibold text-[#D4AA25] hover:underline"
            >
              Login as Travel Agent
            </Link>
            or
            <Link
              href="/auth/signup/operator"
              className="font-semibold text-[#D4AA25] hover:underline"
            >
              Sign up as Tour Operator
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          Loading…
        </div>
      }
    >
      <GuideLoginInner />
    </Suspense>
  );
}
