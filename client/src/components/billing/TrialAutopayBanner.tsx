import { AlertCircle, CreditCard, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/notice';
import { cn } from '@/lib/utils';

export interface TrialSubscriptionSummary {
  id?: string | null;
  status?: string | null;
  tier?: string | null;
  trialEndsAt?: string | null;
  autopayEnabled?: boolean;
  autopayProvider?: string | null;
  autopayConfiguredAt?: string | null;
  autopayLastStatus?: string | null;
}

interface TrialAutopayBannerProps {
  subscription: TrialSubscriptionSummary | null | undefined;
  className?: string;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function computeDaysRemaining(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const now = Date.now();
  const diffMs = end - now;
  if (diffMs < 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function TrialAutopayBanner({ subscription, className }: TrialAutopayBannerProps) {
  if (!subscription) return null;

  const trialEndsAtLabel = formatDate(subscription.trialEndsAt);
  const daysRemaining = computeDaysRemaining(subscription.trialEndsAt);
  const tierLabel = subscription.tier ? subscription.tier.toUpperCase() : 'your plan';

  return (
    <Alert className={cn('border-blue-200 bg-blue-50 text-slate-900', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-blue-700">
            <CreditCard className="h-4 w-4" />
            <AlertTitle className="text-base font-semibold">
              Set up autopay to keep your trial active
            </AlertTitle>
          </div>
          <AlertDescription className="space-y-2 text-sm text-slate-700">
            <p>
              Your {tierLabel} trial is live. Add a payment method now so your workspace stays active when the trial ends.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              {typeof daysRemaining === 'number' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 font-medium text-blue-700">
                  <Timer className="h-3 w-3" />
                  {daysRemaining === 0 ? 'Trial ends today' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`}
                </span>
              ) : null}
              {trialEndsAtLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 font-medium text-blue-700">
                  <AlertCircle className="h-3 w-3" />
                  Ends on {trialEndsAtLabel}
                </span>
              ) : null}
            </div>
          </AlertDescription>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              window.location.href = '/admin/billing';
            }}
          >
            Configure autopay
          </Button>
          <p className="text-xs text-slate-500">
            We’ll only charge your saved method when the trial wraps up.
          </p>
        </div>
      </div>
    </Alert>
  );
}

export default TrialAutopayBanner;
