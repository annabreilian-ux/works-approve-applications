import { Suspense } from "react";

import { SignInForm } from "@/components/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Council review service
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Use a pre-created council account.
          </p>
        </div>

        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <SignInForm />
        </Suspense>
      </section>
    </main>
  );
}
