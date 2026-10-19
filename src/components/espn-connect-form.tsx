"use client";

import { useActionState } from "react";
import { connectEspnAction, type FormState } from "@/app/actions/espn";
import { FieldRow, Group, RowBlock } from "./list";

const STEPS: React.ReactNode[] = [
  <>
    On a computer, open{" "}
    <a href="https://www.espn.com/fantasy/basketball/" target="_blank" rel="noreferrer" className="text-accent">
      espn.com
    </a>{" "}
    and sign in.
  </>,
  <>
    Press <b>F12</b> (or right-click → <b>Inspect</b>) to open Developer Tools.
  </>,
  <>
    Open <b>Application</b> (Firefox: <b>Storage</b>) → <b>Cookies</b> → <b>https://www.espn.com</b>.
  </>,
  <>
    Filter for <code className="font-mono text-[14px]">espn_s2</code>, click the row, and copy its <b>Value</b>.
  </>,
  <>
    Do the same for <code className="font-mono text-[14px]">SWID</code>, including the {"{ }"} braces.
  </>,
];

export function EspnConnectForm({ reconnect = false }: { reconnect?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectEspnAction, undefined);

  return (
    <div className="flex flex-col gap-6">
      <Group header="How to find your cookies">
        {STEPS.map((step, i) => (
          <RowBlock key={i} className="items-start">
            <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white">
              {i + 1}
            </span>
            <span className="text-[15px] leading-snug text-muted [&_b]:font-semibold [&_b]:text-text">{step}</span>
          </RowBlock>
        ))}
      </Group>

      <form action={action} className="flex flex-col gap-6" autoComplete="off">
        <Group
          header="Paste them here"
          footer="Encrypted before they're stored and only ever sent to ESPN. They work like a password for your ESPN account, so don't share them anywhere else. If ESPN expires them, we'll ask you to paste new ones."
        >
          <RowBlock className="flex-col items-stretch gap-1">
            <span className="text-[13px] text-muted">espn_s2</span>
            <textarea
              name="espn_s2"
              required
              rows={3}
              spellCheck={false}
              autoCapitalize="off"
              className="input resize-none font-mono !text-[14px] break-all"
              placeholder="AEB…%3D%3D"
            />
          </RowBlock>
          <FieldRow label="SWID">
            <input
              name="swid"
              required
              spellCheck={false}
              autoCapitalize="off"
              className="input font-mono !text-[14px]"
              placeholder="{XXXXXXXX-XXXX-…}"
            />
          </FieldRow>
        </Group>

        {state?.error && (
          <p role="alert" className="-mt-3 px-5 text-[13px] text-danger">
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Checking with ESPN…" : reconnect ? "Reconnect ESPN" : "Connect ESPN"}
        </button>
      </form>
    </div>
  );
}
