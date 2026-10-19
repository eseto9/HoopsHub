"use client";

import { useActionState } from "react";
import { connectSleeperAction, type SleeperFormState } from "@/app/actions/sleeper";
import { FieldRow, Group } from "./list";

export function SleeperConnectForm() {
  const [state, connect, pending] = useActionState<SleeperFormState, FormData>(connectSleeperAction, undefined);
  return (
    <form action={connect} className="flex flex-col gap-4">
      <Group footer="Your Sleeper username, not your email. No password needed: Sleeper league data is public.">
        <FieldRow label="Username">
          <input name="username" required autoCapitalize="off" autoComplete="off" spellCheck={false} className="input" placeholder="sleeperuser" />
        </FieldRow>
      </Group>
      {state?.error && (
        <p role="alert" className="-mt-2 px-5 text-[13px] text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-secondary w-full" disabled={pending}>
        {pending ? "Connecting…" : "Connect Sleeper"}
      </button>
    </form>
  );
}
