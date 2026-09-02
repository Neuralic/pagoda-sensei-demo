import React, { useState } from 'react';
import { Dialog, DialogContent } from '../ui/dialog';
import { createDateFromStrings } from '@/lib/utils';
import { getOrRequestGoogleToken, clearGoogleToken } from '@/lib/google-auth-client';
import { Button } from '@/components/ui/button';

interface MeetingProps {
    isOpen: boolean;
    onClose: () => void;
    tourGuide?: { email?: string } | null;
    currentUser?: { name?: string } | null;
    chatId: string;
}

function isGoogleVerificationBlock(message: unknown): boolean {
    const m = String(message || "").toLowerCase();
    return (
        m.includes("access blocked") ||
        m.includes("has not completed the google verification process") ||
        m.includes("app-pagoda.org") ||
        m.includes("google verification")
    );
}

function buildFallbackCallUrl(chatId: string): string {
    const rid =
        typeof crypto !== "undefined" && "randomUUID" in crypto && typeof (crypto as any).randomUUID === "function"
            ? (crypto as any).randomUUID()
            : String(Date.now());
    return `https://meet.jit.si/pagoda-${encodeURIComponent(chatId || "chat")}-${rid}`;
}

const MeetingModal = ({ isOpen, onClose, tourGuide, currentUser, chatId }: MeetingProps) => {
    const [date, setDate] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [organization, setOrganization] = useState("");
    const [loading, setLoading] = useState(false);
    const [googleBlocked, setGoogleBlocked] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function formatDateTime(dateStr: string, timeStr: string) {
        const date = createDateFromStrings(dateStr, timeStr);
        if (!date) return "Invalid date";

        const day = String(date.getUTCDate()).padStart(2, "0");
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const year = date.getUTCFullYear();

        const hours = String(date.getUTCHours()).padStart(2, "0");
        const minutes = String(date.getUTCMinutes()).padStart(2, "0");

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    const createMeeting = async () => {
        if (!organization || !date || !start || !end) {
            return alert("Please fill all fields");
        }

        setLoading(true);
        setError(null);
        setGoogleBlocked(false);

        try {
            // Step 1: Get or request Google OAuth token (uses localStorage, same as MeetingButton)
            let refreshToken: string;
            try {
                refreshToken = await getOrRequestGoogleToken();
            } catch (authErr: any) {
                setLoading(false);
                const msg = authErr?.message || "Failed to authenticate with Google. Please allow popups and try again.";
                setGoogleBlocked(isGoogleVerificationBlock(msg));
                setError(msg);
                return;
            }

            // Step 2: Create Google Meet event with refreshToken in request body
            const res = await fetch("/api/meeting", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    start: `${date}T${start}:00`,
                    end: `${date}T${end}:00`,
                    summary: organization,
                    email: tourGuide?.email,
                    senderName: currentUser?.name,
                    refreshToken, // Send token in body instead of relying on cookies
                }),
            });

            const data = await res.json();

            // If token is invalid/expired, clear it and prompt re-auth
            if (!res.ok && (res.status === 401 || data.requiresReauth || data.code === 'invalid_grant')) {
                clearGoogleToken();
                const msg = data.error || "Your Google authentication has expired. Please try again to re-authenticate.";
                setError(msg);
                setLoading(false);
                return;
            }

            if (!res.ok) {
                throw new Error(data.error || "Failed to create meeting");
            }

            // Step 3: Handle success
            if (data.meetLink) {
                onClose();
                setDate("");
                setStart("");
                setEnd("");
                setOrganization("");
                
                // Send meeting link to chat
                if (chatId) {
                    fetch(`/api/chats/messages/${chatId}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: `📹 Google Meet: ${data.meetLink}
Start time: ${formatDateTime(date, start)}
End time: ${formatDateTime(date, end)}`,
                            type: "text",
                        }),
                    }).catch((err) => {
                        console.error("Failed to send meeting link to chat:", err);
                    });
                }
            } else if (data.error) {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : "Failed to create meeting";
            setGoogleBlocked(isGoogleVerificationBlock(msg));
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const startFallbackCall = async () => {
        if (!chatId) {
            setError("Missing chatId; cannot share a call link.");
            return;
        }
        const url = buildFallbackCallUrl(chatId);
        window.open(url, "_blank", "noopener,noreferrer");
        fetch(`/api/chats/messages/${chatId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: `📹 Video call link (no Google auth): ${url}\nStart time: ${formatDateTime(date, start)}\nEnd time: ${formatDateTime(date, end)}`,
                type: "text",
            }),
        }).catch((e) => console.error("Failed to send call link to chat:", e));
        onClose();
        setDate("");
        setStart("");
        setEnd("");
        setOrganization("");
    };

    if (!isOpen) return null;
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]">
                <div className="bg-white p-6 rounded-xl w-96 shadow-lg">
                    <h2 className="text-xl mb-4 font-semibold">Create Google Meet</h2>
                    {error ? (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            <p className="font-medium">Could not create Google Meet</p>
                            <p className="mt-1">{error}</p>
                            {googleBlocked ? (
                                <div className="mt-3">
                                    <p className="text-xs text-red-700/90">
                                        Google is blocking OAuth for this app until verification / consent is completed.
                                        Use the fallback call link below to continue.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="w-full mt-2"
                                        onClick={startFallbackCall}
                                        disabled={loading}
                                    >
                                        Send fallback call link (no Google)
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <label className="block mb-2 text-sm">Meeting summary</label>
                    <input
                        type="text"
                        className="w-full border p-2 rounded mb-4"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                    />
                    <label className="block mb-2 text-sm">Select Date</label>
                    <input
                        type="date"
                        className="w-full border p-2 rounded mb-4"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />

                    <label className="block mb-2 text-sm">Start Time</label>
                    <input
                        type="time"
                        className="w-full border p-2 rounded mb-4"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                    />

                    <label className="block mb-2 text-sm">End Time</label>
                    <input
                        type="time"
                        className="w-full border p-2 rounded mb-4"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                    />

                    <button
                        className="w-full bg-[#F0B100] hover:bg-[#F0B100] text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                        onClick={createMeeting}
                        disabled={loading}
                    >
                        {loading ? "Creating..." : "Create Meeting"}
                    </button>

                    <button
                        className="w-full mt-2 py-2 rounded-md bg-gray-200 cursor-pointer"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default MeetingModal
