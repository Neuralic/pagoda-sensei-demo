import type { ReactNode } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SecurityAuditRow } from "@/lib/security-audit";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function SecurityLogDetailDialog({
  row,
  onClose,
}: {
  row: SecurityAuditRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row?.eventLabel || "Event"}</DialogTitle>
        </DialogHeader>
        {row ? (
          <dl className="mt-4">
            <Field label="When">{formatWhen(row.createdAt)}</Field>
            <Field label="Admin">
              <p className="font-medium">{row.admin.name}</p>
              {row.admin.email ? <p className="text-gray-500 text-xs mt-0.5">{row.admin.email}</p> : null}
            </Field>
            <Field label="Account">
              {row.target.id ? (
                <Link
                  href={`/admin/users/${encodeURIComponent(row.target.id)}`}
                  className="font-medium text-[#af8a10] hover:underline"
                >
                  {row.target.name}
                </Link>
              ) : (
                <p className="font-medium">{row.target.name}</p>
              )}
              {row.target.email ? <p className="text-gray-500 text-xs mt-0.5">{row.target.email}</p> : null}
              <p className="text-gray-500 text-xs mt-0.5">{row.target.roleLabel}</p>
            </Field>
            <Field label="IP">{row.ip || "—"}</Field>
            <Field label="Browser">
              <p className="text-xs leading-relaxed text-gray-700">{row.userAgent || "—"}</p>
            </Field>
            <Field label="Event id">
              <span className="font-mono text-[11px] text-gray-600">{row.id}</span>
            </Field>
          </dl>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
