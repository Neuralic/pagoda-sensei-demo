



import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import { Send, UserIcon, X } from "lucide-react";
import toast from "react-hot-toast";
import { MiniUser, PanicType, TicketWithMessages } from "@/app/types";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import Image from "next/image";


interface PasswordModalProps {
  isOpen: boolean;
  onClose: (value: boolean) => void;
  panicId: string;
  setCount: (value: number) => void;
count: number;
}

const PanicModal = ({ isOpen, onClose, panicId, count, setCount }: PasswordModalProps) => {

 

  const [panicResponse, setPanicResponse] = useState("");
  const [userPanic, setUserPanic] = useState<TicketWithMessages[]>([]);
console.log('userPanic',userPanic);

  const loadUserPanic = async () => {
    try {
      if (!panicId) return;

      const res = await fetch(`/api/panic/${panicId}`, { cache: "no-store" });
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
      //   data.panicList.map(async (ticket) => {
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

      setUserPanic(data.panicList);
    } catch (error) {
      console.error("Error loading panic", error);
    }
  };


  useEffect(() => {
    loadUserPanic();

  }, [panicId]);
  const handleToggle = async () => {
    try {
      const res = await fetch("/api/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_id: "104bd4ed-41f9-4a2a-b998-21012ea68b22",
          ticket_id: userPanic?.[0]?.ticket_id,
          receiver_id: panicId,
          message: panicResponse,
          mark_solved: false,
        }),
      });

      if (res.ok) {
        toast.loading("Alert reply sent.", {
          duration: 2000,
        });

        // 🔥 Update state immediately
        await loadUserPanic();
        setPanicResponse("");
         setCount(count+1);
        // setPanicText(false)
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
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]">
        <div className="bg-white">
          <div className='flex justify-between'>
            <h2 className="text-lg font-bold text-gray-800">Alert</h2>
            <X className="cursor-pointer" onClick={() => onClose(false)} />
          </div>

          <div className="space-y-4 mt-5">
            <div className="space-y-6 mb-5">
              <div className="space-y-6 mb-5">
                {userPanic?.map((alert,index) => (
                  <div
                    key={index}
                    className={`flex space-x-4`}
                  >
                    <div className='w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0  bg-gradient-to-br from-slate-600 to-slate-700 text-white'>
                      {/* {message.sender?.signedProfileUrl ? (
                        <Image
                          src={message.sender?.signedProfileUrl}
                          alt="profile"
                          width={100}
                          height={100}
                          className="w-full h-full object-cover rounded-full"
                          priority={false}
                        />
                      ) : <UserIcon />} */}
                      <UserIcon />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-semibold text-slate-900">
                          {alert?.sender_name ?? "Support"}
                        </span>

                        <span className="text-xs text-slate-500">
                          {alert?.created_at ? new Date(alert.created_at).toLocaleString() : ""}
                        </span>
                      </div>

                      <div className="text-slate-700 whitespace-pre-line leading-relaxed">
                        {alert?.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className=" bg-white border-t border-slate-200 pt-6">
                <div className="flex space-x-4">
                  <textarea
                    value={panicResponse}
                    onChange={(e) => setPanicResponse(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex flex-col space-y-2">
                    <button onClick={handleToggle} className="cursor-pointer p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"  >
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
  );
};

export default PanicModal;
