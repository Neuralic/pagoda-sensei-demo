"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";

/**
 * Opt-in mirror: new in-app messages from your counterpart are also sent to your WhatsApp
 * (Meta Cloud API must be configured on the server).
 */
export function WhatsAppSyncBar() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/whatsapp-settings", { cache: "no-store" });
        const j = await res.json();
        if (!cancelled && j?.ok) {
          setCloudConfigured(Boolean(j.cloudConfigured));
          setEnabled(Boolean(j.enabled));
          setHasPhone(Boolean(j.hasPhone));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !cloudConfigured) return null;

  const toggle = async (checked: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/whatsapp-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        toast.error(typeof j?.error === "string" ? j.error : "Could not update");
        return;
      }
      setEnabled(checked);
      toast.success(checked ? "WhatsApp delivery on" : "WhatsApp delivery off");
    } catch {
      toast.error("Could not update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 flex flex-wrap items-center gap-3 text-sm mb-3 w-full">
      <div className="flex items-center gap-2">
        <Checkbox
          id="wa-sync"
          checked={enabled}
          disabled={saving || !hasPhone}
          onChange={(e) => {
            void toggle(e.target.checked);
          }}
        />
        <Label htmlFor="wa-sync" className="cursor-pointer font-medium text-foreground">
          Also deliver new messages to my WhatsApp
        </Label>
      </div>
      {!hasPhone ? (
        <span className="text-muted-foreground text-xs">
          Add a mobile number with country code in your account to use this.
        </span>
      ) : null}
    </div>
  );
}
