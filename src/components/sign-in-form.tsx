"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { FeedbackAlert } from "@/components/feedback-alert";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/services/http-auth-service";

function getSafeReturnPath(returnTo: string | null): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/applications";
  }

  return returnTo;
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  const sessionExpired = searchParams.get("reason") === "session-expired";
  const canSubmit = username.trim().length > 0 && password.length > 0 && !isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextUsernameError = username.trim() ? undefined : "Enter your username.";
    const nextPasswordError = password ? undefined : "Enter your password.";
    setUsernameError(nextUsernameError);
    setPasswordError(nextPasswordError);
    setFormError(undefined);

    if (nextUsernameError || nextPasswordError) return;

    setIsPending(true);
    const result = await authService.signIn({ username, password });
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    router.push(getSafeReturnPath(searchParams.get("returnTo")));
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      {sessionExpired ? (
        <FeedbackAlert
          kind="warning"
          title="Session expired"
          message="Your session expires, sign in again."
        />
      ) : null}

      {formError ? (
        <FeedbackAlert
          kind="error"
          title="Sign in failed"
          message={formError}
        />
      ) : null}

      <TextField
        id="username"
        label="Username"
        name="username"
        autoComplete="username"
        required
        value={username}
        error={usernameError}
        disabled={isPending}
        onChange={(event) => {
          setUsername(event.target.value);
          if (event.target.value.trim()) setUsernameError(undefined);
          setFormError(undefined);
        }}
      />

      <TextField
        id="password"
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        required
        value={password}
        error={passwordError}
        disabled={isPending}
        onChange={(event) => {
          setPassword(event.target.value);
          if (event.target.value) setPasswordError(undefined);
          setFormError(undefined);
        }}
      />

      <div className="flex items-center gap-1">
        <input
          id="show-password"
          type="checkbox"
          checked={showPassword}
          disabled={isPending}
          onChange={(event) => setShowPassword(event.target.checked)}
        />
        {" "}
        <label className="text-sm" htmlFor="show-password">Show password</label>
      </div>

      <Button className="w-full" type="submit" disabled={!canSubmit}>
        {isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : null}
        {isPending ? "Signing in" : "Sign in"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Read-only user: password: &quot;reader.worker&quot; as the login and &quot;Reader7777----&quot; as the password to sign
        in.<br />
        Executer: &quot;anna.worker&quot; as the login and &quot;Anna7777----&quot; as the password.
      </p>
    </form>
  );
}
