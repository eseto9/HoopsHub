import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see all your leagues.">
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </AuthShell>
  );
}
