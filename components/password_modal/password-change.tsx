import React, { useMemo, useEffect, useState } from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import { Input } from "../ui/input";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import {
  ADMIN_PASSWORD_POLICY_HINT,
  passwordMeetsAdminResetPolicy,
} from "@/lib/admin-password-policy";

interface PasswordModalProps {
  isOpen: boolean;
  onClose: (value: boolean) => void;
  userId: string | number;
}

const PasswordChange = ({ isOpen, onClose, userId }: PasswordModalProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirm(false);
  }, [isOpen]);

  const { canSubmit, errorMsg } = useMemo(() => {
    if (!password && !confirmPassword) {
      return { canSubmit: false, errorMsg: "" as string };
    }
    if (!passwordMeetsAdminResetPolicy(password)) {
      return { canSubmit: false, errorMsg: ADMIN_PASSWORD_POLICY_HINT };
    }
    if (password !== confirmPassword) {
      return { canSubmit: false, errorMsg: "Passwords do not match." };
    }
    return { canSubmit: true, errorMsg: "" };
  }, [password, confirmPassword]);

  const handleUpdate = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newPassword: password }),
      });

      const data = await response.json().catch(() => ({}));

      if (data.ok) {
        toast.success("Password updated. The user can sign in with the new password.", { duration: 4000 });
        setPassword("");
        setConfirmPassword("");
        onClose(false);
      } else {
        toast.error(typeof data.error === "string" ? data.error : "Failed to update password");
        console.error(data.error);
      }
    } catch (err) {
      toast.error("Request failed");
      console.error("API error", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]">
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">New Password</label>
          <div className="relative mt-2">
            <span className="absolute left-3 inset-y-0 flex items-center">
              <Lock className="h-5 w-5 text-gray-400" />
            </span>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              className="h-10 pl-10 pr-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 inset-y-0 flex items-center text-gray-500 cursor-pointer"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <label className="mb-2 block text-sm font-medium text-gray-700 mt-4">
            Confirm Password
          </label>
          <div className="relative mt-2">
            <span className="absolute left-3 inset-y-0 flex items-center">
              <Lock className="h-5 w-5 text-gray-400" />
            </span>
            <Input
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm new password"
              className="h-10 pl-10 pr-12"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              className="absolute right-3 inset-y-0 flex items-center text-gray-500 cursor-pointer"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {errorMsg ? <p className="text-red-500 text-sm mt-2 leading-snug">{errorMsg}</p> : null}

          <div className="flex justify-center mt-3">
            <Button type="button" onClick={() => void handleUpdate()} disabled={!canSubmit || submitting}>
              {submitting ? "Updating…" : "Update user password"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PasswordChange;
