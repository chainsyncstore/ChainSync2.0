import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export default function AdminBillingPage() {
  const [billingEmail, setBillingEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [subs, setSubs] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', provider: '', from: '', to: '' });

  const loadSettings = useCallback(async () => {
    setSettingsError(null);
    try {
      const res = await fetch('/api/admin/org/billing', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load billing settings (${res.status})`);
      }
      const data = await res.json();
      setBillingEmail(data?.org?.billingEmail || '');
    } catch (error) {
      console.error('Failed to load billing settings', error);
      setSettingsError(error instanceof Error ? error.message : 'Failed to load billing settings');
    }
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/org/billing', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingEmail })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message = payload?.error || 'Failed to save';
        alert(message);
        throw new Error(message);
      }
    } catch (error) {
      console.error('Failed to save billing settings', error);
      alert(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
      await loadSettings();
    }
  }

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const subRes = await fetch(`/api/admin/subscriptions?${new URLSearchParams({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.provider ? { provider: filters.provider } : {}),
      }).toString()}`, { credentials: 'include' });
      if (!subRes.ok) {
        throw new Error(`Failed to load subscriptions (${subRes.status})`);
      }
      const subsJson = await subRes.json();
      setSubs(subsJson?.subscriptions || []);

      const payRes = await fetch(`/api/admin/subscription-payments?${new URLSearchParams({
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.provider ? { provider: filters.provider } : {}),
      }).toString()}`, { credentials: 'include' });
      if (!payRes.ok) {
        throw new Error(`Failed to load subscription payments (${payRes.status})`);
      }
      const paysJson = await payRes.json();
      setPayments(paysJson?.payments || []);

      const evRes = await fetch(`/api/admin/dunning-events`, { credentials: 'include' });
      if (!evRes.ok) {
        throw new Error(`Failed to load dunning events (${evRes.status})`);
      }
      const evJson = await evRes.json();
      setEvents(evJson?.events || []);
    } catch (error) {
      console.error('Failed to load billing data', error);
      setDataError(error instanceof Error ? error.message : 'Failed to load billing data');
    } finally {
      setLoadingData(false);
    }
  }, [filters]);

  const handleRetryDunning = useCallback(async (subscriptionId: string) => {
    try {
      const res = await fetch(`/api/admin/dunning/${encodeURIComponent(subscriptionId)}/retry`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to retry dunning (${res.status})`);
      }
      await loadData();
    } catch (error) {
      console.error('Failed to retry dunning', error);
      alert(error instanceof Error ? error.message : 'Failed to retry dunning');
    }
  }, [loadData]);

  const handleUpdatePaymentMethod = useCallback(async (subscriptionId: string) => {
    try {
      const res = await fetch(`/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}/update-payment`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to create payment update link (${res.status})`);
      }
      const payload = await res.json().catch(() => ({}));
      if (payload?.redirectUrl) {
        window.open(payload.redirectUrl, '_blank', 'noopener');
      } else {
        throw new Error(payload?.error || 'Unable to generate payment link');
      }
    } catch (error) {
      console.error('Failed to update payment method', error);
      alert(error instanceof Error ? error.message : 'Failed to update payment method');
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { void loadData();   }, [loadData]);

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Billing Contact</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-center">
            <Input placeholder="billing@example.com" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} />
            <Button onClick={saveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
          {settingsError && <p className="text-sm text-red-600 mt-2">{settingsError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input placeholder="status (ACTIVE, PAST_DUE, CANCELLED)" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} />
            <Input placeholder="provider (PAYSTACK, FLW)" value={filters.provider} onChange={e => setFilters(f => ({ ...f, provider: e.target.value }))} />
            <Button variant="outline" onClick={() => void loadData()}>Refresh</Button>
          </div>
          {dataError && <div className="text-sm text-red-600 mb-3">{dataError}</div>}
          {loadingData ? <div className="text-sm text-gray-500">Loading…</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Period End</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.planCode}</TableCell>
                    <TableCell>{s.provider}</TableCell>
                    <TableCell>{s.status}</TableCell>
                    <TableCell>{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleString() : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loadingData && subs.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-sm font-medium">Actions</div>
              <div className="flex flex-wrap gap-2">
                {subs.map((s) => (
                  <div key={s.id} className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void handleRetryDunning(s.id)}
                    >
                      Retry dunning now ({s.planCode})
                    </Button>
                    <Button onClick={() => void handleUpdatePaymentMethod(s.id)}>
                      Update payment method
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input placeholder="from (YYYY-MM-DD)" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
            <Input placeholder="to (YYYY-MM-DD)" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
            <Button variant="outline" onClick={() => void loadData()}>Refresh</Button>
          </div>
          {dataError && <div className="text-sm text-red-600 mb-3">{dataError}</div>}
          {loadingData ? <div className="text-sm text-gray-500">Loading…</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.occurredAt ? new Date(p.occurredAt).toLocaleString() : '-'}</TableCell>
                    <TableCell>{p.provider}</TableCell>
                    <TableCell>{p.currency} {p.amount}</TableCell>
                    <TableCell>{p.status}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{p.reference}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dunning History</CardTitle>
        </CardHeader>
        <CardContent>
          {dataError && <div className="text-sm text-red-600 mb-3">{dataError}</div>}
          {loadingData ? <div className="text-sm text-gray-500">Loading…</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.sentAt ? new Date(e.sentAt).toLocaleString() : '-'}</TableCell>
                    <TableCell className="truncate max-w-[240px]">{e.subscriptionId}</TableCell>
                    <TableCell>{e.attempt}</TableCell>
                    <TableCell>{e.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


