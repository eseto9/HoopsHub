"use client";

import Link from "next/link";

/** iOS-style bottom sheet for confirming a real change on a platform. */
export function Sheet({
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  disabled,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={pending ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-[22px] bg-surface"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="px-5 pt-5 text-center text-[17px] font-semibold">{title}</h2>
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2">{children}</div>
        <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
          <button
            type="button"
            className={`btn w-full ${destructive ? "bg-danger text-white" : "btn-primary"}`}
            disabled={pending || disabled}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
          <button type="button" className="btn btn-secondary w-full" disabled={pending} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export type NoticeState = { kind: "ok" | "error"; text: string; reconnect?: boolean } | null;

export function Notice({ notice }: { notice: NoticeState }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className={`rounded-[14px] px-4 py-3 text-[15px] ${notice.kind === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
    >
      {notice.text}
      {notice.reconnect && (
        <Link href="/connections#espn-account" className="ml-2 font-semibold underline">
          Reconnect
        </Link>
      )}
    </div>
  );
}
