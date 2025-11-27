import { ShieldCheck, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/notice";

export type TwoFactorChallengeUser = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

interface TwoFactorModalProps {
  user: TwoFactorChallengeUser | null;
  error: string | null;
  isSubmitting: boolean;
  // eslint-disable-next-line no-unused-vars
  onSubmit: (code: string) => Promise<boolean>;
  onCancel: () => void;
}

export function TwoFactorModal({ user, error, isSubmitting, onSubmit, onCancel }: TwoFactorModalProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isOpen = Boolean(user);

  useEffect(() => {
    if (isOpen) {
      setCode("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  }, [isOpen]);

  const displayName = user?.firstName || user?.email || "your account";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) return;
    await onSubmit(code.trim());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next && isOpen) void onCancel(); }}>
      <DialogContent className="sm:max-w-md" aria-describedby="two-factor-description">
        <DialogHeader className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-xl">Two-Factor Verification</DialogTitle>
          <DialogDescription id="two-factor-description" className="text-center">
            Enter the 6-digit code from your authenticator app to finish signing in to {displayName}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="two-factor-code" className="text-sm font-medium text-muted-foreground">
              Authentication code
            </label>
            <Input
              id="two-factor-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              value={code}
              ref={inputRef}
              onChange={(event) => {
                const next = event.target.value.replace(/[^0-9]/g, "");
                setCode(next.slice(0, 6));
              }}
              disabled={isSubmitting}
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="order-2 sm:order-1"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Back to login
            </Button>
            <Button
              type="submit"
              className="order-1 sm:order-2"
              disabled={isSubmitting || code.length !== 6}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify code
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
