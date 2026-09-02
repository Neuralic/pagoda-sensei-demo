import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent } from "../ui/dialog";
import { MiniUser, PanicType, TicketWithMessages } from '@/app/types';
import { Paperclip, Phone, Send, UserIcon, X } from 'lucide-react';
import Image from 'next/image';
import toast from 'react-hot-toast';

interface WarningModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onConfirm?: () => void;
  onCancel: () => void;
  panicResponse: string;
  setPanicResponse: (value: string) => void;
  userPanic?: TicketWithMessages[];
  panicText: boolean;
  setPanicText: (value: boolean) => void;
  jobId?: string;
  userId?: string;
}

const PanicAlert = ({
  isOpen,
  title = "Assistance Required",
  onConfirm,
  onCancel, panicResponse, setPanicResponse, userPanic, panicText, setPanicText, jobId, userId
}: WarningModalProps) => {
  const [userPanicInfo, setUserPanicInfo] = useState<TicketWithMessages[]>([]);

  const panicAlert = async () => {
    if (!userId) {
      alert("You must be logged in to send an alert.");
      return;
    }

    try {
      const res = await fetch("/api/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_id: userId,
          ticket_id: jobId,
          receiver_id: "104bd4ed-41f9-4a2a-b998-21012ea68b22",
          message: panicResponse,
          mark_solved: false,
        }),
      });

      if (res.ok) {
        toast.loading("Alert sent! Support has been notified.", {
          duration: 2000,
        });

        // 🔥 Update state immediately
        await loadUserPanic();
        setPanicResponse("");
        //      setWarningModal(false);
        setPanicText(false)
      } else {
        toast.loading("Failed to send alert. Please try again.", {
          duration: 2000,
        });
      }
    } catch (err) {
      toast.loading("Something went wrong while sending alert.", {
        duration: 2000,
      });
    }
  };
  // Alert
  const loadUserPanic = async () => {
    console.log('id', userId, jobId);
    if (!userId || !jobId) return console.warn("Missing userId or jobId");
    try {
      const res = await fetch(`/api/panic/${userId}?job_id=${jobId}`, {
        cache: "no-store",
      });
      const data: {
        ok: boolean;
        panicList?: Array<{
          ticket_id: string;
          messages: Array<{
            id: number;
            message: string | null;
            created_at: string;
            sender: MiniUser | null;
            status: boolean | null;
            is_read: boolean | null;
          }>;
        }>;
      } = await res.json();
      if (!data.ok || !data.panicList) return;
      // const panicListWithUrls = await Promise.all(
      //   data?.panicList.map(async (ticket) => {
      //     const messagesWithUrls = await Promise.all(
      //       ticket.messages.map(async (msg) => {
      //         let signedProfileUrl: string | null = null;

      //         if (msg.sender && typeof msg.sender.user_image === "string" && msg.sender.user_image) {
      //           const [signed] = await getSignedUrls([{ bucket: BUCKETS.avatars, path: msg.sender.user_image }]);
      //           signedProfileUrl = signed?.signedUrl || signed?.publicUrl || null;
      //         }

      //         return {
      //           ...msg,
      //           sender: msg.sender ? { ...msg.sender, signedProfileUrl } : null,
      //         };
      //       })
      //     );

      //     return {
      //       ...ticket,
      //       messages: messagesWithUrls,
      //     };
      //   })
      // );
      setUserPanicInfo(data.panicList);

    } catch (error) {
      console.log("Error loading panic", error);
    }
  };

  useEffect(() => {
    loadUserPanic();

  }, [jobId]);


  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]">
        <div className="bg-white">
          <div className='flex justify-between'>
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <X className="cursor-pointer" onClick={() => onCancel()} />
          </div>

          <div className="space-y-4 mt-5">
            <div className="space-y-6 mb-5">
              <div className="mb-5 flex-1 overflow-y-auto py-4 space-y-4">
                {userPanicInfo && userPanicInfo.length > 0 ? (
                  userPanicInfo.map((alert, index) => {
                    const isSenderMe = alert.sender_id === userId;

                    return (
                      <div
                        key={index}
                        className={`flex gap-3 mb-4 ${isSenderMe ? "flex-row-reverse" : ""}`}
                      >
                        {/* Avatar */}
                        <div className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100 items-center justify-center">
                          <UserIcon />
                        </div>

                        {/* Message bubble */}
                        <div className={`flex-1 ${isSenderMe ? "flex flex-col items-end" : ""}`}>
                          <div className={`flex items-center space-x-2 mb-2 ${isSenderMe ? "justify-end" : ""}`}>
                            <span className="text-xs text-slate-500">
                              {alert.created_at ? new Date(alert.created_at).toLocaleString() : ""}
                            </span>
                          </div>

                          <div
                            className={`text-sm text-foreground mt-1 max-w-md rounded-lg px-3 py-2 ${isSenderMe ? "bg-[#F9F5E8]" : "bg-[#F9FAFB]"
                              }`}
                          >
                            {alert.message}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-gray-400 py-10">No messages</div>
                )}
              </div>

              <div className="bg-white border-t border-slate-200 pt-6">
                <div className="flex space-x-4">
                  <textarea
                    value={panicResponse}
                    onChange={(e) => setPanicResponse(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex flex-col space-y-2">
                    <button onClick={panicAlert} className="cursor-pointer p-3 bg-[#D4AA25] hover:bg-[#f3be11] text-white rounded-lg transition-colors"  >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PanicAlert