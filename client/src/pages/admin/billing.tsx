import {
  CreditCard,
  RefreshCcw,
  ShieldAlert,
  Store,
  Timer,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StoreReactivationModal } from '@/components/admin/store-reactivation-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { getCsrfToken } from '@/lib/csrf';

import type { Store as StoreRecord } from '@shared/schema';

interface AutopayDetailsSummary {
  email: string | null;
  last4: string | null;
  expMonth: string | null;
  expYear: string | null;
  cardType: string | null;
  bank: string | null;
}

interface BillingOverviewResponse {
  subscription: {
    id: string;
    tier: string;
    planCode: string;
    provider: string;
    status: string;
    monthlyAmount: number;
    monthlyCurrency: string;
    nextBillingDate: string | null;
    trialStartAt: string | null;
    trialEndsAt: string | null;
    startedAt: string | null;
    currentPeriodEnd: string | null;
    createdAt: string | null;
    autopayEnabled: boolean;
    autopayProvider: string | null;
    autopayLastStatus: string | null;
    currencySymbol: string;
  };
  autopay: {
    enabled: boolean;
    provider: string | null;
    status: string | null;
    configuredAt: string | null;
    details: AutopayDetailsSummary | null;
  };
  stores: {
    active: number;
    inactive: number;
    total: number;
    limit: number | null;
    requiresStoreReduction: boolean;
    canReactivate?: boolean;
    needsReactivation?: boolean;
    inactiveStoreIds?: string[];
  };
  pricing: {
    provider: string;
    currency: 'NGN' | 'USD';
    currencySymbol: string;
    tiers: Array<{
      tier: string;
      code: string;
      monthlyAmountMinor: number;
      monthlyAmount: number;
      currency: string;
      currencySymbol: string;
      maxStores: number | null;
      isCurrent: boolean;
      isDowngrade: boolean;
      requiresStoreReduction: boolean;
      disabledReason: string | null;
    }>;
  };
  trial: {
    endsAt: string | null;
    daysRemaining: number | null;
    reminders: {
      sent7Day: string | null;
      sent3Day: string | null;
    };
    status: string;
  };
  organization: {
    id: string;
    name: string | null;
    billingEmail: string | null;
    adminEmail: string | null;
  };
  recommendations: {
    needsAutopay: boolean;
  };
}

type PricingTier = BillingOverviewResponse['pricing']['tiers'][number];

const formatDate = (value?: string | Date | null) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const calculateProgress = (start?: string | Date | null, end?: string | Date | null) => {
  if (!start || !end) return 0;
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  if (!startDate || !endDate) return 0;
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 0;
  }
  const now = Date.now();
  if (now <= startMs) return 0;
  const elapsed = Math.min(endMs - startMs, now - startMs);
  return Math.round((elapsed / (endMs - startMs)) * 100);
};

export default function AdminBillingPage() {
  const { toast } = useToast();

  const [overview, setOverview] = useState<BillingOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [planSubmitting, setPlanSubmitting] = useState<string | null>(null);
  const [autopayLoading, setAutopayLoading] = useState(false);
  const [autopayDisabling, setAutopayDisabling] = useState(false);

  const [downgradeDialogOpen, setDowngradeDialogOpen] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<PricingTier | null>(null);
  const [storeList, setStoreList] = useState<StoreRecord[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [storeSubmitting, setStoreSubmitting] = useState(false);
  const [reactivationModalOpen, setReactivationModalOpen] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/overview', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load billing overview (${res.status})`);
      }
      const data = await res.json();
      setOverview(data);
    } catch (err) {
      console.error('Failed to load billing overview', err);
      setError(err instanceof Error ? err.message : 'Unable to load billing information.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOverview();
    } finally {
      setRefreshing(false);
    }
  }, [fetchOverview]);

  const handleAutopayConfirmIfNeeded = useCallback(async () => {
    if (!overview?.organization?.id) return;
    const params = new URLSearchParams(window.location.search);
    const autopayStatus = params.get('autopay');
    const autopayReference = params.get('reference');
    const autopayProvider = params.get('provider');
    const autopayMessage = params.get('autopayMessage');

    if (!autopayStatus) return;

    if (autopayStatus !== 'success') {
      toast({
        title: 'Autopay setup failed',
        description: autopayMessage || 'Unable to verify payment method. Please try again.',
        variant: 'destructive',
      });
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (autopayStatus === 'success' && autopayReference && autopayProvider) {
      try {
        await apiClient.post('/billing/autopay/confirm', {
          provider: autopayProvider,
          reference: autopayReference,
        });
        toast({ title: 'Payment method saved', description: 'Autopay has been configured successfully.' });
        window.history.replaceState({}, document.title, window.location.pathname);
        await fetchOverview();
      } catch (error) {
        console.error('Autopay confirm failed', error);
        toast({
          title: 'Autopay confirmation failed',
          description: error instanceof Error ? error.message : 'Unable to confirm autopay. Please try again.',
          variant: 'destructive',
        });
      }
    }
  }, [fetchOverview, overview?.organization?.id, toast]);

  useEffect(() => {
    void handleAutopayConfirmIfNeeded();
  }, [handleAutopayConfirmIfNeeded]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  // Show reactivation modal when subscription is reactivated and stores need reactivation
  useEffect(() => {
    if (overview?.stores?.needsReactivation && overview?.stores?.canReactivate) {
      setReactivationModalOpen(true);
    }
  }, [overview?.stores?.needsReactivation, overview?.stores?.canReactivate]);

  const trialDaysRemaining = overview?.trial.daysRemaining;
  const trialEndsAt = overview?.trial.endsAt ?? overview?.subscription.trialEndsAt;
  const subscriptionStatus = overview?.subscription.status?.toUpperCase();
  const isTrial = useMemo(() => {
    if (!overview) return false;
    if (subscriptionStatus === 'TRIAL') return true;
    if (typeof trialDaysRemaining === 'number' && trialDaysRemaining > 0) return true;
    if (trialEndsAt) {
      const end = new Date(trialEndsAt);
      if (!Number.isNaN(end.getTime()) && end.getTime() > Date.now()) {
        return true;
      }
    }
    return false;
  }, [overview, subscriptionStatus, trialDaysRemaining, trialEndsAt]);

  const currentTierPricing = useMemo(() => {
    if (!overview) return null;
    return overview.pricing.tiers.find((tier) => tier.isCurrent) ?? null;
  }, [overview]);

  const displayPeriod = useMemo(() => {
    if (!overview) {
      return { start: null, end: null, nextCharge: null, progress: 0 };
    }

    const { subscription } = overview;

    const normalizedTrialStart = subscription.trialStartAt ?? subscription.createdAt ?? subscription.nextBillingDate ?? null;
    const normalizedTrialEnd = subscription.trialEndsAt ?? subscription.nextBillingDate ?? null;
    const normalizedBillingStart = subscription.startedAt ?? subscription.currentPeriodEnd ?? subscription.trialEndsAt ?? subscription.nextBillingDate ?? null;
    const normalizedBillingEnd = subscription.currentPeriodEnd ?? subscription.nextBillingDate ?? subscription.startedAt ?? null;
    const normalizedNextChargeTrial = subscription.nextBillingDate ?? subscription.trialEndsAt ?? subscription.currentPeriodEnd ?? null;
    const normalizedNextChargeActive = subscription.nextBillingDate ?? subscription.currentPeriodEnd ?? null;

    const start = isTrial ? normalizedTrialStart : normalizedBillingStart;
    const end = isTrial ? normalizedTrialEnd : normalizedBillingEnd;

    return {
      start,
      end,
      nextCharge: isTrial ? normalizedNextChargeTrial : normalizedNextChargeActive,
      progress: calculateProgress(start, end),
    };
  }, [isTrial, overview]);

  const currentPlanCurrencySymbol = currentTierPricing?.currencySymbol
    ?? overview?.pricing.currencySymbol
    ?? overview?.subscription.currencySymbol
    ?? '';

  const currentPlanAmount = currentTierPricing?.monthlyAmount
    ?? overview?.subscription.monthlyAmount
    ?? 0;

  const loadStores = useCallback(async () => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const res = await fetch('/api/stores', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Unable to load stores');
      }
      const data = await res.json();
      setStoreList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load stores', err);
      setStoreError(err instanceof Error ? err.message : 'Unable to fetch stores');
    } finally {
      setStoreLoading(false);
    }
  }, []);

  const handleSetupAutopay = useCallback(async () => {
    if (!overview) return;
    const contactEmail = overview.organization.billingEmail || overview.organization.adminEmail;
    if (!contactEmail) {
      toast({
        title: 'Missing billing contact',
        description: 'Please update your admin email so we can initiate autopay.',
        variant: 'destructive',
      });
      return;
    }

    setAutopayLoading(true);
    try {
      const token = await getCsrfToken();
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify({
          orgId: overview.organization.id,
          planCode: overview.subscription.planCode,
          email: contactEmail,
          paymentMethod: 'card',
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to start autopay setup');
      }

      if (payload?.reference) {
        localStorage.setItem('chainsync_autopay_reference', payload.reference);
      }

      if (payload?.redirectUrl) {
        window.location.href = payload.redirectUrl;
        return;
      }

      toast({
        title: 'Autopay initialized',
        description: 'Complete the provider flow in the newly opened window.',
      });
    } catch (err) {
      toast({
        title: 'Autopay setup failed',
        description: err instanceof Error ? err.message : 'Unable to launch autopay flow.',
        variant: 'destructive',
      });
    } finally {
      setAutopayLoading(false);
    }
  }, [overview, toast]);

  const handleDisableAutopay = useCallback(async () => {
    setAutopayDisabling(true);
    try {
      const token = await getCsrfToken();
      const res = await fetch('/api/billing/autopay', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': token,
        },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to disable autopay');
      }
      toast({ title: 'Autopay disabled' });
      await refreshOverview();
    } catch (err) {
      toast({
        title: 'Disable failed',
        description: err instanceof Error ? err.message : 'Try again later.',
        variant: 'destructive',
      });
    } finally {
      setAutopayDisabling(false);
    }
  }, [refreshOverview, toast]);

  const handleUpdatePaymentMethod = useCallback(async () => {
    if (!overview) return;
    try {
      const token = await getCsrfToken();
      const res = await fetch(`/api/admin/subscriptions/${encodeURIComponent(overview.subscription.id)}/update-payment`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': token,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to generate update link');
      }
      if (payload?.redirectUrl) {
        window.open(payload.redirectUrl, '_blank', 'noopener');
      }
    } catch (err) {
      toast({
        title: 'Unable to manage autopay',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [overview, toast]);

  const handleManageAutopay = useCallback(() => {
    if (!overview) return;
    if (overview.autopay.enabled) {
      void handleUpdatePaymentMethod();
      return;
    }
    void handleSetupAutopay();
  }, [handleSetupAutopay, handleUpdatePaymentMethod, overview]);

  const submitPlanChange = useCallback(async (tier: string) => {
    if (!overview) return;
    setPlanSubmitting(tier);
    try {
      const token = await getCsrfToken();
      const res = await fetch(`/api/admin/subscriptions/${overview.subscription.id}/plan`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify({ targetPlan: tier }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to update plan');
      }
      toast({ title: 'Subscription updated', description: `You are now on the ${tier.toUpperCase()} plan.` });
      await refreshOverview();
      
      // After plan change, check if we should show reactivation modal
      // This happens when upgrading and there are inactive stores that can now be reactivated
      const newOverview = await fetch('/api/billing/overview', { credentials: 'include' }).then(r => r.json()).catch(() => null);
      if (newOverview?.stores?.canReactivate && newOverview?.stores?.inactiveStoreIds?.length > 0) {
        // Small delay to ensure state is updated
        setTimeout(() => {
          setReactivationModalOpen(true);
        }, 500);
      }
    } catch (err) {
      toast({
        title: 'Plan update failed',
        description: err instanceof Error ? err.message : 'Try again later.',
        variant: 'destructive',
      });
    } finally {
      setPlanSubmitting(null);
    }
  }, [overview, refreshOverview, toast]);

  const openDowngradeDialog = useCallback(
    async (tier: PricingTier) => {
      setDowngradeTarget(tier);
      setDowngradeDialogOpen(true);
      setSelectedStoreIds([]);
      if (!storeList.length) {
        await loadStores();
      }
    },
    [loadStores, storeList.length],
  );

  const activeStores = useMemo(
    () => storeList.filter((store) => store.isActive !== false),
    [storeList],
  );

  const requiredStoreLimit = downgradeTarget?.maxStores ?? null;
  const storesAboveLimit = useMemo(() => {
    if (requiredStoreLimit == null) return 0;
    return Math.max(0, activeStores.length - requiredStoreLimit);
  }, [activeStores.length, requiredStoreLimit]);

  const canConfirmDowngrade = downgradeTarget
    ? storesAboveLimit === 0 || selectedStoreIds.length >= storesAboveLimit
    : false;

  const toggleStoreSelection = (id: string) => {
    setSelectedStoreIds((prev) => (prev.includes(id) ? prev.filter((storeId) => storeId !== id) : [...prev, id]));
  };

  const deactivateSelectedStores = useCallback(async () => {
    if (!selectedStoreIds.length) return;
    setStoreSubmitting(true);
    try {
      const token = await getCsrfToken();
      await Promise.all(
        selectedStoreIds.map((storeId) =>
          fetch(`/api/stores/${storeId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': token,
            },
            body: JSON.stringify({ isActive: false }),
          }).then(async (res) => {
            if (!res.ok) {
              const payload = await res.json().catch(() => ({}));
              throw new Error(payload?.error || 'Failed to deactivate store');
            }
          }),
        ),
      );
      toast({ title: 'Stores deactivated', description: `${selectedStoreIds.length} store(s) were deactivated.` });
      await loadStores();
      await refreshOverview();
    } finally {
      setStoreSubmitting(false);
    }
  }, [loadStores, refreshOverview, selectedStoreIds, toast]);

  const handleApplyDowngrade = useCallback(async () => {
    if (!downgradeTarget) return;
    try {
      if (storesAboveLimit > 0) {
        await deactivateSelectedStores();
      }
      await submitPlanChange(downgradeTarget.tier);
      setDowngradeDialogOpen(false);
      setDowngradeTarget(null);
    } catch (err) {
      toast({
        title: 'Downgrade failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [deactivateSelectedStores, downgradeTarget, storesAboveLimit, submitPlanChange, toast]);

  const planActionLabel = (tier: PricingTier) => {
    if (tier.isCurrent) return 'Current plan';
    if (tier.isDowngrade) return 'Downgrade';
    return 'Upgrade';
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading billing information…</div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-lg font-semibold text-red-600">{error || 'Billing data unavailable'}</div>
        <Button onClick={() => void fetchOverview()} variant="default">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing &amp; Plan</h1>
          <p className="text-sm text-muted-foreground">Manage your subscription, stores, and payment automation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refreshOverview()} disabled={refreshing}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-blue-200 bg-blue-50 text-slate-900">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-blue-700">
            <Timer className="h-4 w-4" />
            <CardTitle className="text-base">{isTrial ? 'Trial timeline' : 'Billing timeline'}</CardTitle>
          </div>
          <CardDescription className="text-sm text-slate-700">
            {isTrial ? 'Track your trial access window.' : 'Current billing cycle details.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-slate-600">Start date</p>
              <p className="text-lg font-semibold text-slate-900">
                {displayPeriod.start ? formatDate(displayPeriod.start) : 'Pending schedule'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-600">End date</p>
              <p className="text-lg font-semibold text-slate-900">
                {displayPeriod.end ? formatDate(displayPeriod.end) : 'Pending schedule'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-600">Next payment</p>
              <p className="text-lg font-semibold text-slate-900">
                {displayPeriod.nextCharge ? formatDate(displayPeriod.nextCharge) : 'To be determined'}
              </p>
            </div>
          </div>
          <div>
            <Progress value={displayPeriod.progress} />
            <p className="mt-2 text-xs text-slate-700">
              {isTrial
                ? displayPeriod.end
                  ? typeof trialDaysRemaining === 'number'
                    ? `${Math.max(trialDaysRemaining, 0)} day${trialDaysRemaining === 1 ? '' : 's'} remaining`
                    : `Trial wraps on ${formatDate(displayPeriod.end)}`
                  : 'Trial schedule pending'
                : displayPeriod.start && displayPeriod.end
                ? `Billing cycle ${formatDate(displayPeriod.start)} – ${formatDate(displayPeriod.end)}`
                : displayPeriod.nextCharge
                ? `Renews on ${formatDate(displayPeriod.nextCharge)}`
                : 'Billing schedule updating'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Current plan</CardTitle>
            <CardDescription>
              {overview.subscription.tier?.toUpperCase()} • {currentPlanCurrencySymbol}
              {currentPlanAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}/mo via {overview.subscription.provider}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Store className="h-4 w-4" /> Active stores
              </div>
              <div className="mt-3 text-3xl font-semibold">{overview.stores.active}</div>
              <p className="text-sm text-muted-foreground">
                {overview.stores.limit ? `Limit: ${overview.stores.limit} stores` : 'Unlimited stores'}
              </p>
              {overview.stores.limit && (
                <Progress
                  value={Math.min(100, (overview.stores.active / overview.stores.limit) * 100)}
                  className="mt-3"
                />
              )}
              {overview.stores.requiresStoreReduction && (
                <div className="mt-2 flex items-center gap-2 text-sm text-amber-600">
                  <ShieldAlert className="h-4 w-4" /> Reduce active stores before downgrading.
                </div>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4" /> Autopay status
              </div>
              <div className="mt-3 text-3xl font-semibold">
                {overview.autopay.enabled ? 'Enabled' : 'Not configured'}
              </div>
              <p className="text-sm text-muted-foreground">
                {overview.autopay.enabled
                  ? `Linked via ${overview.autopay.provider || overview.subscription.provider}`
                  : 'Save a card or mandate so we can renew automatically.'}
              </p>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void handleManageAutopay()} disabled={autopayLoading && !overview.autopay.enabled}>
                    {overview.autopay.enabled
                      ? 'Manage autopay'
                      : autopayLoading
                      ? 'Working…'
                      : 'Add payment method'}
                  </Button>
                  {overview.autopay.enabled && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={handleDisableAutopay}
                      disabled={autopayDisabling}
                    >
                      {autopayDisabling ? 'Removing…' : 'Disable'}
                    </Button>
                  )}
                </div>
              </div>
              {overview.autopay.details && overview.autopay.enabled && (
                <div className="mt-4 rounded-md bg-muted p-3 text-sm">
                  <div className="font-semibold">{overview.autopay.details.cardType || 'Payment method'}</div>
                  <div className="text-muted-foreground">
                    **** {overview.autopay.details.last4 || '••••'} · expires {overview.autopay.details.expMonth}/{overview.autopay.details.expYear}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plans &amp; pricing</CardTitle>
          <CardDescription>Switch tiers anytime. Store limits apply on downgrades.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {overview.pricing.tiers.map((tier) => (
            <div key={tier.tier} className={`flex flex-col rounded-lg border p-4 ${tier.isCurrent ? 'border-primary shadow-sm' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold capitalize">{tier.tier}</div>
                  <div className="text-sm text-muted-foreground">
                    {tier.currencySymbol}
                    {tier.monthlyAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}/mo
                  </div>
                </div>
                {tier.isCurrent && <Badge variant="secondary">Current</Badge>}
              </div>
              <div className="mt-4 flex-1 text-sm text-muted-foreground">
                {tier.maxStores ? `Up to ${tier.maxStores} stores` : 'Unlimited stores'}
              </div>
              {tier.requiresStoreReduction && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
                  <ShieldAlert className="h-3 w-3" />
                  {tier.disabledReason || 'Deactivate extra stores before switching.'}
                </div>
              )}
              <Button
                className="mt-4"
                variant={tier.isCurrent ? 'outline' : tier.isDowngrade ? 'secondary' : 'default'}
                disabled={tier.isCurrent || planSubmitting === tier.tier}
                onClick={() => {
                  if (tier.isCurrent) return;
                  if (tier.requiresStoreReduction) {
                    void openDowngradeDialog(tier);
                    return;
                  }
                  void submitPlanChange(tier.tier);
                }}
              >
                {planSubmitting === tier.tier ? 'Applying…' : planActionLabel(tier)}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Key subscription details for your records.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-muted-foreground">Organization</div>
            <div className="text-base font-medium">{overview.organization.name || '—'}</div>
            <div className="text-xs text-muted-foreground">Admin contact: {overview.organization.adminEmail || '—'}</div>
            <div className="text-xs text-muted-foreground">Billing email: {overview.organization.billingEmail || '—'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Next invoice</div>
            <div className="text-base font-medium">
              {overview.subscription.nextBillingDate
                ? new Date(overview.subscription.nextBillingDate).toLocaleString()
                : isTrial
                  ? 'After trial'
                  : 'Pending'}
            </div>
            <div className="text-xs text-muted-foreground">Provider: {overview.subscription.provider}</div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={downgradeDialogOpen} onOpenChange={setDowngradeDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prepare to move to {downgradeTarget?.tier.toUpperCase()} plan</DialogTitle>
            <DialogDescription>
              {downgradeTarget?.maxStores
                ? `Select at least ${storesAboveLimit} store(s) to deactivate so you meet the ${downgradeTarget.maxStores} store limit.`
                : 'Review active stores before confirming your downgrade.'}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-md border p-3">
            {storeLoading && <div className="text-sm text-muted-foreground">Loading stores…</div>}
            {storeError && <div className="text-sm text-destructive">{storeError}</div>}
            {!storeLoading && !storeError && activeStores.length === 0 && (
              <div className="text-sm text-muted-foreground">No active stores to manage.</div>
            )}
            {!storeLoading && activeStores.map((store) => (
              <label
                key={store.id}
                className="flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{store.name}</div>
                  <div className="text-xs text-muted-foreground">{store.address || 'No address on file'}</div>
                </div>
                <Checkbox
                  checked={selectedStoreIds.includes(store.id)}
                  onCheckedChange={() => toggleStoreSelection(store.id)}
                  disabled={storeSubmitting}
                />
              </label>
            ))}
          </div>

          {storesAboveLimit > 0 && (
            <p className="text-sm text-muted-foreground">
              Select at least <strong>{storesAboveLimit}</strong> store(s) to deactivate. You can reactivate them after upgrading again.
            </p>
          )}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Need more control? Manage stores from the Multi-store page.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDowngradeDialogOpen(false)} disabled={storeSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleApplyDowngrade()}
                disabled={!canConfirmDowngrade || planSubmitting === downgradeTarget?.tier || storeSubmitting}
              >
                {storeSubmitting || planSubmitting === downgradeTarget?.tier ? 'Applying…' : 'Confirm downgrade'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StoreReactivationModal
        isOpen={reactivationModalOpen}
        onClose={() => setReactivationModalOpen(false)}
        onSuccess={() => {
          void fetchOverview();
        }}
        storeLimit={overview?.stores?.limit ?? null}
        inactiveStoreIds={overview?.stores?.inactiveStoreIds ?? []}
      />
    </div>
  );
}

