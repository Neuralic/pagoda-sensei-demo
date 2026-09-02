"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

interface RequestPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  applicantId: string;
  jobName?: string;
  guideName?: string;
  onSent?: () => void;
}

export function RequestPriceUpdateModal({
  isOpen,
  onClose,
  jobId,
  applicantId,
  jobName,
  guideName,
  onSent,
}: RequestPriceUpdateModalProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/bids/request-price-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          applicant_id: applicantId,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send request");
        return;
      }
      toast.success("Request sent. The guide will receive an email.");
      setMessage("");
      onClose();
      onSent?.();
    } catch {
      toast.error("Failed to send request");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    if (!sending) {
      setMessage("");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Request price update</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {guideName && (
            <span>Send an email to <strong>{guideName}</strong></span>
          )}
          {jobName && (
            <span>
              {guideName ? " " : ""}about the job &quot;{jobName}&quot;. The guide can update their price on the Jobs Board.
            </span>
          )}
          {!guideName && !jobName && "Ask the guide to update their price via email."}
        </p>
        <label className="block text-sm font-medium mb-2">Your message (optional)</label>
        <textarea
          className="w-full min-h-[120px] px-3 py-2 border border-border rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="e.g. Please update your bid price for this job. We need a final quote by..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={handleClose} disabled={sending} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="bg-[#D4AA25] hover:bg-[#D4AA25]/90 text-white cursor-pointer"
          >
            {sending ? "Sending…" : "Send email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
