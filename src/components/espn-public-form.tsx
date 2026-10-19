"use client";

import { useActionState, useState } from "react";
import { addEspnLeagueAction, lookupEspnLeagueAction, type LookupState } from "@/app/actions/espn";
import { FieldRow, Group } from "./list";

export function EspnPublicForm() {
  const [state, lookup, looking] = useActionState<LookupState, FormData>(lookupEspnLeagueAction, undefined);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <form action={lookup} className="flex flex-col gap-4">
        <Group footer="The number after leagueId= in the league's address. You can paste the whole URL.">
          <FieldRow label="League ID">
            <input name="leagueId" required autoCapitalize="off" spellCheck={false} className="input" placeholder="12345678" />
          </FieldRow>
        </Group>
        {state?.error && (
          <p role="alert" className="-mt-2 px-5 text-[13px] text-danger">
            {state.error}
          </p>
        )}
        <button type="submit" className="btn btn-secondary w-full" disabled={looking}>
          {looking ? "Looking Up…" : "Find League"}
        </button>
      </form>

      {state?.league && state.teams && (
        <form action={addEspnLeagueAction} onSubmit={() => setAdding(true)} className="flex flex-col gap-4">
          <input type="hidden" name="leagueId" value={state.league.externalId} />
          <Group header={`${state.league.name} · Which team is yours?`}>
            {state.teams.map((t) => (
              <label key={t.externalId} className="row cursor-pointer has-[:checked]:[&_.check]:opacity-100">
                <input type="radio" name="teamId" value={t.externalId} required className="sr-only" />
                <span className="row-body">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.name}</span>
                    <span className="block truncate text-[15px] text-muted">{t.ownerName}</span>
                  </span>
                  <svg viewBox="0 0 16 16" className="check h-4 w-4 shrink-0 text-accent opacity-0" aria-hidden="true">
                    <path d="M2 8.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </label>
            ))}
          </Group>
          <button type="submit" className="btn btn-primary w-full" disabled={adding}>
            {adding ? "Adding…" : "Add League"}
          </button>
        </form>
      )}
    </div>
  );
}
