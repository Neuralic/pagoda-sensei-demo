// components/ui/select.tsx
"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

interface SelectTriggerProps {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

interface SelectValueProps {
  placeholder?: string;
}

interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const SelectContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}>({
  value: "",
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
});

export function Select({ value = "", onValueChange, children }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(value);

  const handleValueChange = (newValue: string) => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
    setOpen(false);
  };

  return (
    <SelectContext.Provider value={{
      value: internalValue,
      onValueChange: handleValueChange,
      open,
      setOpen,
    }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className = "", disabled = false }: SelectTriggerProps) {
  const { setOpen, value } = React.useContext(SelectContext);

  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={() => {
        if (!disabled) setOpen(true);
      }}
    >
      {children || <span>{value || "Select..."}</span>}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const { value } = React.useContext(SelectContext);
  return <span>{value || placeholder}</span>;
}

export function SelectContent({ children, className = "" }: SelectContentProps) {
  const { open, setOpen } = React.useContext(SelectContext);

  if (!open) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40" 
        onClick={() => setOpen(false)}
      />
      <div className={`absolute top-full left-0 z-50 w-full mt-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80 ${className}`}>
        {children}
      </div>
    </>
  );
}

export function SelectItem({ value, children, className = "" }: SelectItemProps) {
  const { onValueChange } = React.useContext(SelectContext);

  return (
    <div
      className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${className}`}
      onClick={() => onValueChange(value)}
    >
      {children}
    </div>
  );
}