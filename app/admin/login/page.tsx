"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { useRedirectIfAuthenticated } from "@/hooks/use-redirect-if-authenticated";
import { homePathForRole } from "@/lib/auth-home";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const checkingSession = useRedirectIfAuthenticated();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please enter email and password.");
      toast.error("Please enter both email and password.", { duration: 4000 });
      return;
    }

    const loadingToast = toast.loading("Signing you in...");
    setLoading(true);

    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      toast.dismiss(loadingToast);

      if (!res.ok) {
        const msg = data?.error || "Login failed.";
        setError(msg);
        toast.error(msg, { duration: 3000 });
        return;
      }

      toast.success("Login successful! Redirecting...", { duration: 2000 });

      const dest =
        redirectTo && redirectTo.startsWith("/admin")
          ? redirectTo
          : homePathForRole("admin");
      router.replace(dest);
    } catch (err) {
      toast.dismiss(loadingToast);
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4 text-sm text-gray-500">
        Checking session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-semibold text-center mb-4">Admin Login</h1>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <div className="relative mt-2">
              <span className="absolute left-3 inset-y-0 flex items-center">
                <Mail className="h-4 w-4 text-gray-400" />
              </span>
              <Input
                type="email"
                placeholder="admin@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Password</label>
            <div className="relative mt-2">
              <span className="absolute left-3 inset-y-0 flex items-center">
                <Lock className="h-4 w-4 text-gray-400" />
              </span>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="admin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 inset-y-0 flex items-center text-gray-500"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Logging in..." : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
