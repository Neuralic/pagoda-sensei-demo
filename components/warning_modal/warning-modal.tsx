import React from "react";
import { Dialog, DialogContent } from "../ui/dialog";

interface WarningModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const WarningModal = ({
  isOpen,
  title = "Attention",
  message = "Please review the information before proceeding.",
  onConfirm,
  onCancel,
}: WarningModalProps) => {
  if (!isOpen) return null;

  return (

    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]">
        <div className="bg-white">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <p className="mt-3 text-gray-600 text-md">{message}</p>

          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={onCancel}
              className="cursor-pointer px-6 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
            >
              No
            </button>
            <button
              onClick={onConfirm}
              className="cursor-pointer px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
            >
              Yes
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WarningModal;
