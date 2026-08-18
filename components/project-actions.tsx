"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

interface Props {
  project: { project_ref: string; monitoring_enabled: boolean };
}

export function ProjectActions({ project }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function checkNow() {
    setBusy("check");
    try {
      await fetch(`/api/projects/${project.project_ref}/check`, {
        method: "POST",
      });
    } catch {
      // The page refresh below reflects the recorded result either way.
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function toggle(kind: "pause" | "resume") {
    setBusy(kind);
    await fetch(`/api/projects/${project.project_ref}/${kind}`, {
      method: "POST",
    });
    router.refresh();
    setBusy(null);
  }

  async function remove() {
    setBusy("remove");
    const res = await fetch(`/api/projects/${project.project_ref}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setBusy(null);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <button
        onClick={checkNow}
        disabled={busy !== null}
        className="btn btn-secondary w-full justify-center sm:w-auto"
        title="Run a check now instead of waiting for the next scheduled one"
      >
        {busy === "check" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Check now
      </button>
      {project.monitoring_enabled ? (
        <button
          onClick={() => toggle("pause")}
          disabled={busy !== null}
          className="btn btn-secondary w-full justify-center sm:w-auto"
        >
          {busy === "pause" && <Loader2 className="h-4 w-4 animate-spin" />}
          Pause monitoring
        </button>
      ) : (
        <button
          onClick={() => toggle("resume")}
          disabled={busy !== null}
          className="btn btn-primary w-full justify-center sm:w-auto"
        >
          {busy === "resume" && <Loader2 className="h-4 w-4 animate-spin" />}
          Resume monitoring
        </button>
      )}

      {confirmRemove ? (
        <span className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <span className="text-sm text-zinc-500">Remove project?</span>
          <button
            onClick={remove}
            disabled={busy !== null}
            className="btn btn-danger w-full justify-center sm:w-auto"
          >
            {busy === "remove" && <Loader2 className="h-4 w-4 animate-spin" />}
            Yes, remove
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="btn btn-secondary w-full justify-center sm:w-auto"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmRemove(true)}
          className="btn btn-danger w-full justify-center sm:w-auto"
        >
          Remove
        </button>
      )}
    </div>
  );
}
