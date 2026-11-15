"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authService } from "@/lib/services/http-auth-service";

export function AppHeader() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await authService.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div>
          <Link
            href="/applications"
            className="font-semibold tracking-tight focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Works Approve Applications
          </Link>
          <p className="text-sm text-muted-foreground">Council review service</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isSigningOut}
          onClick={() => void signOut()}
        >
          {isSigningOut ? "Signing out" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
