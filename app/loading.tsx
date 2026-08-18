import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
    </div>
  );
}
