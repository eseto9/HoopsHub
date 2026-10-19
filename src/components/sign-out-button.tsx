"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth/client";

/** Red "Sign Out" row, like the bottom of iOS Settings → Apple Account. */
export function SignOutRow() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="row justify-center !pl-0 text-danger disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      {pending ? "Signing Out…" : "Sign Out"}
    </button>
  );
}
