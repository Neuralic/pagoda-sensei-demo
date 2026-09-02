"use client";

import { Archive, RotateCcw, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

type Props = {
  guideId: string;
  guideProfileStatus: string;
  isActive?: boolean;
  onUpdated?: () => void;
  /** Called after a successful permanent delete (e.g. navigate away from edit page). */
  onDeleted?: () => void;
};

type ConfirmAction = "archive" | "deactivate" | "reactivate" | "delete";

const ACTION_COPY: Record<
  ConfirmAction,
  { title: string; description: string; confirmLabel: string; destructive?: boolean }
> = {
  archive: {
    title: "Archive this guide?",
    description:
      "They will be hidden from the active list and their public profile will be unpublished.",
    confirmLabel: "Archive",
  },
  deactivate: {
    title: "Deactivate this guide?",
    description:
      "They cannot be booked and their marketplace profile will be turned off.",
    confirmLabel: "Deactivate",
    destructive: true,
  },
  reactivate: {
    title: "Reactivate this guide?",
    description: "They will return to draft status — publish again when ready.",
    confirmLabel: "Reactivate",
  },
  delete: {
    title: "Delete this guide forever?",
    description:
      "This cannot be undone. Their login and marketplace profile will be permanently removed.",
    confirmLabel: "Delete",
    destructive: true,
  },
};

function askConfirmToast(action: ConfirmAction): Promise<boolean> {
  const copy = ACTION_COPY[action];
  return new Promise((resolve) => {
    toast.custom(
      (t) => (
        <div
          role="alertdialog"
          className={`pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-lg ${
            t.visible ? "opacity-100" : "opacity-0"
          } transition-opacity`}
        >
          <div>
            <p className="text-sm font-semibold">{copy.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className={
                copy.destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-[#D4AA25] text-black hover:bg-[#C49A1F]"
              }
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              {copy.confirmLabel}
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity, position: "top-center" }
    );
  });
}

export function GuideStatusActions({
  guideId,
  guideProfileStatus,
  isActive = true,
  onUpdated,
  onDeleted,
}: Props) {
  const status = guideProfileStatus || "draft";
  const archived = status === "archived";
  const deactivated = status === "deactivated" || isActive === false;
  const canManage = !archived && !deactivated;
  const canDelete = deactivated || archived;

  const runAction = async (action: "archive" | "deactivate" | "reactivate") => {
    const confirmed = await askConfirmToast(action);
    if (!confirmed) return;

    const res = await fetch(`/api/operator/my-guides/${guideId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error || "Action failed");
      return;
    }
    toast.success(
      action === "archive"
        ? "Guide archived"
        : action === "deactivate"
          ? "Guide deactivated"
          : "Guide reactivated"
    );
    onUpdated?.();
  };

  const deleteGuide = async () => {
    const confirmed = await askConfirmToast("delete");
    if (!confirmed) return;

    const res = await fetch(`/api/operator/my-guides/${guideId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error || "Delete failed");
      return;
    }
    toast.success("Guide profile deleted");
    onDeleted?.();
    onUpdated?.();
  };

  if (canManage) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void runAction("archive")}
        >
          <Archive className="h-4 w-4" />
          Archive
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void runAction("deactivate")}
        >
          <UserX className="h-4 w-4" />
          Deactivate
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => void runAction("reactivate")}
      >
        <RotateCcw className="h-4 w-4" />
        Reactivate
      </Button>
      {canDelete ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void deleteGuide()}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      ) : null}
    </div>
  );
}
