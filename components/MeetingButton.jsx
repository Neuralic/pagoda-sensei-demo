"use client"

import { useState } from "react"
import { Video, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getOrRequestGoogleToken, clearGoogleToken } from "@/lib/google-auth-client"
import MeetingModal from "./meeting_modal/meeting-modal"

function isGoogleVerificationBlock(message) {
  const m = String(message || "").toLowerCase()
  return (
    m.includes("access blocked") ||
    m.includes("has not completed the google verification process") ||
    m.includes("app-pagoda.org") ||
    m.includes("google verification")
  )
}

function buildFallbackCallUrl(chatId) {
  const rid =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  return `https://meet.jit.si/pagoda-${encodeURIComponent(chatId || "chat")}-${rid}`
}

export function MeetingButton({ tourGuide, currentUser, chatId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [googleBlocked, setGoogleBlocked] = useState(false)
  const [open, setOpen] = useState(false);
  const handleStartMeeting = async () => {
    // Validate props
    if (!tourGuide?.id || !tourGuide?.name || !tourGuide?.email) {
      setError("Tour guide information is incomplete")
      return
    }
    if (!currentUser?.id || !currentUser?.name || !currentUser?.email) {
      setError("User information is incomplete")
      return
    }

    setLoading(true)
    setError(null)
    setGoogleBlocked(false)

    try {
      // Step 1: Get or request Google OAuth token
      let refreshToken
      try {
        refreshToken = await getOrRequestGoogleToken()
      } catch (authErr) {
        const msg =
          authErr?.message ||
          "Failed to authenticate with Google. Please allow popups and try again."
        setGoogleBlocked(isGoogleVerificationBlock(msg))
        throw new Error(msg)
      }

      // Step 2: Create Google Meet event
      const createRes = await fetch("/api/meetings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tourGuideName: tourGuide.name,
          tourGuideEmail: tourGuide.email,
          userName: currentUser.name,
          userEmail: currentUser.email,
          duration: 60,
          refreshToken,
        }),
      })

      const createData = await createRes.json()

      // If token is invalid/expired, clear it and prompt re-auth
      if (!createRes.ok && (createRes.status === 401 || createData.requiresReauth || createData.code === 'invalid_grant')) {
        clearGoogleToken()
        setError(createData.error || "Your Google authentication has expired. Please click the button again to re-authenticate.")
        setLoading(false)
        return
      }

      if (!createRes.ok || !createData.success) {
        throw new Error(createData.error || "Failed to create meeting")
      }

      const { meetLink, eventId, startTime, endTime } = createData

      if (!meetLink) {
        throw new Error("No meeting link received from Google Calendar")
      }

      // Step 3: Open Meet link in new tab immediately
      window.open(meetLink, "_blank", "noopener,noreferrer")

      // Step 4: Send meeting link to chat
      if (chatId) {
        fetch(`/api/chats/messages/${chatId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `📹 Google Meet started: ${meetLink}`,
            type: "text",
          }),
        }).catch((err) => {
          console.error("Failed to send meeting link to chat:", err)
        })
      }

      // Step 5: Save meeting to Supabase (non-blocking)
      fetch("/api/meetings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          meetLink,
          tourGuideId: tourGuide.id,
          userId: currentUser.id,
          startTime,
          endTime,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            console.warn("Failed to save meeting to database:", data.error)
          }
        })
        .catch((err) => {
          console.error("Error saving meeting:", err)
        })

      setLoading(false)
    } catch (err) {
      console.error("Meeting creation error:", err)
      const msg = err instanceof Error ? err.message : "Failed to start meeting"
      setGoogleBlocked(isGoogleVerificationBlock(msg))
      setError(msg)
      setLoading(false)
    }
  }

  const startFallbackCall = async () => {
    if (!chatId) {
      setError("Missing chatId; cannot share a call link.")
      return
    }
    const url = buildFallbackCallUrl(chatId)
    window.open(url, "_blank", "noopener,noreferrer")
    fetch(`/api/chats/messages/${chatId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `📹 Video call link (no Google auth): ${url}`,
        type: "text",
      }),
    }).catch((err) => {
      console.error("Failed to send call link to chat:", err)
    })
  }



  return (
    <div className="space-y-2">
      <Button
        onClick={handleStartMeeting}
        disabled={loading}
        className="w-full bg-[#F0B100] hover:bg-[#F0B100] text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Creating Meeting...</span>
          </>
        ) : (
          <>
            <Video className="h-5 w-5" />
            <span>Start Google Meet</span>
          </>
        )}
      </Button>

      <Button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="w-full bg-[#F0B100] hover:bg-[#F0B100] text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Creating Meeting...</span>
          </>
        ) : (
          <>
            <Video className="h-5 w-5" />
            <span>Schedule Google Meet</span>
          </>
        )}
      </Button>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p>{error}</p>
            {googleBlocked ? (
              <div className="space-y-2">
                <p className="text-xs text-red-700/90">
                  Google is blocking OAuth for this app until the verification / consent screen is
                  completed. You can still start a call using the fallback button below.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={startFallbackCall}
                  disabled={loading}
                >
                  Start video call (no Google)
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <MeetingModal isOpen={open} onClose={() => setOpen(false)} tourGuide={tourGuide} currentUser={currentUser} chatId={chatId}  />
    </div>
  )
}
