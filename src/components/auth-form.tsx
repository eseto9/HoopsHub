"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth/client";
import { FieldRow, Group } from "./list";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const { error } = isSignUp
      ? await signUp.email({ email, password, name: String(form.get("name") || email.split("@")[0]) })
      : await signIn.email({ email, password });

    if (error) {
      setPending(false);
      setError(
        error.status === 401
          ? "Wrong email or password."
          : error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "An account with that email already exists. Sign in instead."
            : (error.message ?? "Something went wrong. Try again."),
      );
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Group footer={isSignUp ? "Password must be at least 8 characters." : undefined}>
        {isSignUp && (
          <FieldRow label="Name">
            <input className="input" name="name" autoComplete="name" placeholder="Optional" />
          </FieldRow>
        )}
        <FieldRow label="Email">
          <input className="input" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" />
        </FieldRow>
        <FieldRow label="Password">
          <input
            className="input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder="Required"
          />
        </FieldRow>
      </Group>

      {error && (
        <p role="alert" className="-mt-3 px-5 text-[13px] text-danger">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? (isSignUp ? "Creating Account…" : "Signing In…") : isSignUp ? "Create Account" : "Sign In"}
      </button>

      <p className="text-center text-[15px] text-muted">
        {isSignUp ? "Already have an account? " : "New to Hoops Hub? "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="text-accent">
          {isSignUp ? "Sign In" : "Create Account"}
        </Link>
      </p>
    </form>
  );
}
