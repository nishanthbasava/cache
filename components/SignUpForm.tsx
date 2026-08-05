"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function SignUpForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-up" | "log-in">("sign-up");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);
    setMessage(null);
    setIsError(false);

    const formData = new FormData(form);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    try {
      const supabase = createClient();
      const { data, error } =
        mode === "sign-up"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setIsError(true);
        setMessage(error.message);
        return;
      }

      if (data.session) {
        router.push("/capture");
        router.refresh();
        return;
      }

      form.reset();
      setMessage("Account created. Check your email to confirm your address.");
    } catch {
      setIsError(true);
      setMessage("Supabase is not configured. Add the required environment variables.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-1 text-center">
        <h2 className="font-heading text-2xl font-bold">
          {mode === "sign-up" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {mode === "sign-up"
            ? "Sign up to start saving what you learn."
            : "Log in to continue to your captures."}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="h-11 w-full rounded-lg border bg-background px-3 text-base outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          className="h-11 w-full rounded-lg border bg-background px-3 text-base outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          minLength={6}
          placeholder="At least 6 characters"
          required
        />
      </div>

      <Button className="h-11 w-full" disabled={loading} type="submit">
        {loading
          ? mode === "sign-up"
            ? "Creating account…"
            : "Logging in…"
          : mode === "sign-up"
            ? "Sign up"
            : "Log in"}
      </Button>

      {message && (
        <p
          className={isError ? "text-sm text-destructive" : "text-sm text-foreground"}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-up" ? "Already have an account?" : "Need an account?"}{" "}
        <button
          className="font-medium text-foreground underline-offset-4 hover:underline"
          type="button"
          onClick={() => {
            setMode(mode === "sign-up" ? "log-in" : "sign-up");
            setMessage(null);
            setIsError(false);
          }}
        >
          {mode === "sign-up" ? "Log in" : "Sign up"}
        </button>
      </p>

      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <span className="relative bg-background px-2 text-xs text-muted-foreground">or</span>
      </div>

      <button
        type="button"
        className="h-11 w-full rounded-lg border text-sm font-medium hover:bg-muted"
        onClick={() => router.push("/capture")}
      >
        Demo
      </button>
    </form>
  );
}
