"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  label: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  variant?: "btn-danger" | "btn-secondary";
  busy?: boolean;
  confirmText?: string;
}

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = "btn-danger",
  busy = false,
  confirmText,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await onConfirm();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-2">
        <span className="w-full text-left text-xs text-zinc-500 sm:w-auto sm:text-sm">
          {confirmText ?? "Are you sure?"}
        </span>
        <button onClick={handleClick} disabled={busy} className={`btn ${variant}`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="btn btn-secondary"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button onClick={handleClick} disabled={busy} className={`btn ${variant}`}>
      {label}
    </button>
  );
}
