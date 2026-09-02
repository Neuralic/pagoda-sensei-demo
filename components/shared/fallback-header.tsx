"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import Image from "next/image";
import Logo from "../../public/assets/images/pagodalogo.jpg";

/** Shown when bootstrap cannot load user — still allows logout */
export function FallbackHeader() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Logged out");
    } catch {
      toast.error("Logout failed — try clearing cookies");
    }
    const role =
      typeof document !== "undefined"
        ? document.cookie
            .split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith("role="))
            ?.split("=")[1]
        : null;
    if (role === "guide") router.push("/guide/login");
    else if (role === "admin") router.push("/admin/login");
    else router.push("/agent/login");
  };

  return (
    <header className="shrink-0 z-50 w-full border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 flex h-14 items-center justify-between">
        <Link href="/">
          <Image src={Logo} alt="Pagoda" className="h-8 w-auto" />
        </Link>
        <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2 text-red-600">
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </header>
  );
}
