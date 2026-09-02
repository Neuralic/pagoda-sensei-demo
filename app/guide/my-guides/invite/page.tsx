"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";

export default function InviteGuidePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Guide name is required");
      return;
    }
    setSending(true);
    const res = await fetch("/api/operator/my-guides/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: fullName.trim(), email: email.trim() || undefined }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      toast.error(data.error || "Invite failed");
      return;
    }
    if (data.inviteUrl) {
      await navigator.clipboard.writeText(data.inviteUrl);
    }
    if (data.emailSent) {
      toast.success("Invite email sent and link copied to clipboard");
    } else if (data.emailFallback) {
      toast.success("Link copied (configure SMTP to send emails automatically)");
    } else if (email.trim()) {
      toast.success("Invite link copied — email could not be sent");
    } else {
      toast.success("Invite link copied to clipboard");
    }
    router.push("/guide/my-guides");
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-lg">
      <Link href="/guide/my-guides" className="text-sm text-[#D4AA25] hover:underline">
        ← My Guides
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">Invite a guide</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Creates a profile stub and sends a link so the guide can set their login, upload a photo,
        and add their introduction video themselves.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Guide full name *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <Label>Guide email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="recommended — invite link will be emailed"
          />
        </div>
        <Button type="submit" disabled={sending} className="bg-[#D4AA25] text-black w-full">
          {sending ? "Sending…" : "Create profile & send invite"}
        </Button>
      </form>
    </main>
  );
}
