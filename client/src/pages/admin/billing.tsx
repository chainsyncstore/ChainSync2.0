import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminBillingPage() {
  const [billingEmail, setBillingEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [subs, setSubs] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filters, setFilters] = useState({ status: '', provider: '', from: '', to: '' });

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/org/billing', { credentials: 'include' });
      const data = await res.json();
      setBillingEmail(data?.org?.billingEmail || '');
    } catch {}
  }

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
        const j = await res.json().catch(() => ({}));
        alert(j?.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
      await loadSettings();
    }
  }

  async function loadData() {
    setLoadingData(true);
    try {
      const subRes = await fetch(`/api/admin/subscriptions?${new URLSearchParams({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.provider ? { provider: filters.provider } : {}),
      }).toString()}`, { credentials: 'include' });
      const subsJson = await subRes.json();
      setSubs(subsJson?.subscriptions || []);

      const payRes = await fetch(`/api/admin/subscription-payments?${new URLSearchParams({
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.provider ? { provider: filters.provider } : {}),
      }).toString()}`, { credentials: 'include' });
      const paysJson = await payRes.json();
      setPayments(paysJson?.payments || []);

      const evRes = await fetch(`/api/admin/dunning-events`, { credentials: 'include' });
      const evJson = await evRes.json();
      setEvents(evJson?.events || []);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [filters.status, filters.provider, filters.from, filters.to]);

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
            <Button variant="outline" onClick={loadData}>Refresh</Button>
          </div>
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
                    <Button variant="secondary" onClick={async () => {
                      await fetch(`/api/admin/dunning/${encodeURIComponent(s.id)}/retry`, { method: 'POST', credentials: 'include' });
                      await loadData();
                    }}>Retry dunning now ({s.planCode})</Button>
                    <Button onClick={async () => {
                      const r = await fetch(`/api/admin/subscriptions/${encodeURIComponent(s.id)}/update-payment`, { method: 'POST', credentials: 'include' });
                      const j = await r.json().catch(() => ({}));
                      if (j?.redirectUrl) {
                        window.open(j.redirectUrl, '_blank');
                      } else {
                        alert(j?.error || 'Unable to generate payment link');
                      }
                    }}>Update payment method</Button>
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
            <Button variant="outline" onClick={loadData}>Refresh</Button>
          </div>
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


