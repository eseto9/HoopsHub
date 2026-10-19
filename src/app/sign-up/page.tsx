import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell title="Create your account" subtitle="One place for every fantasy basketball league you're in.">
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </AuthShell>
  );
}
