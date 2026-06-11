"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle, XCircle } from "lucide-react";

export function CancelGuestRegistrationButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#8a4b3a] ring-1 ring-[#e6c9bd] transition hover:bg-[#fff4ef] disabled:cursor-not-allowed disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
      {pending ? "正在取消" : "取消报名"}
    </button>
  );
}
