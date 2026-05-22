"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { verifyCodeAction } from "./actions";

interface CodeFormProps {
  email: string;
  type: string;
  next: string;
  /** Optional banner shown above the form (e.g. "link was already used"). */
  initialNotice?: string;
}

/**
 * OPH-113: Client form that submits a 6-digit OTP code to `verifyCodeAction`.
 *
 * Kept as a client component (not pure server form action) so we can render
 * inline validation/error feedback without a page redirect on failure —
 * users mistype codes routinely and a hard refresh would be annoying.
 */
export function CodeForm({ email, type, next, initialNotice }: CodeFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await verifyCodeAction(formData);
      if (!result?.ok) {
        setError(result?.error ?? "Verifizierung fehlgeschlagen.");
      }
      // On success, the server action redirects — we won't reach this line.
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />

      {initialNotice && !error && (
        <Alert>
          <AlertDescription>{initialNotice}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="confirm-email">E-Mail-Adresse</Label>
        <Input
          id="confirm-email"
          type="email"
          value={email}
          readOnly
          className="bg-muted"
          aria-label="E-Mail-Adresse (vorausgefüllt)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="otp-code">6-stelliger Code</Label>
        <Input
          id="otp-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={9}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123 456"
          className="text-center text-lg font-mono tracking-widest"
          aria-describedby="otp-help"
        />
        <p id="otp-help" className="text-xs text-muted-foreground">
          Geben Sie den Code aus Ihrer E-Mail ein. Leerzeichen und Bindestriche
          werden ignoriert.
        </p>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? "Wird überprüft…" : "Code bestätigen"}
      </Button>
    </form>
  );
}
