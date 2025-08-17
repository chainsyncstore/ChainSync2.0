import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export default function AdminBulkPricingPage() {
  const [type, setType] = useState<'percentage'|'absolute'>('percentage');
  const [value, setValue] = useState('0');
  const [skuPrefix, setSkuPrefix] = useState('');
  const [nameContains, setNameContains] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [changes, setChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/bulk-pricing/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'ui-' + Date.now() },
        credentials: 'include',
        body: JSON.stringify({ type, value, skuPrefix, nameContains, dryRun }),
      });
      if (!res.ok) throw new Error('Bulk pricing failed');
      const data = await res.json();
      setChanges(data.changes || []);
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function uploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/bulk-pricing/upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      alert(`Applied: ${data.applied}`);
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <select className="border px-2 py-1 rounded" value={type} onChange={e => setType(e.target.value as any)}>
              <option value="percentage">Percentage (+/-)</option>
              <option value="absolute">Set Absolute</option>
            </select>
            <Input placeholder={type === 'percentage' ? 'e.g. 10 for +10%' : 'e.g. 999.99'} value={value} onChange={e => setValue(e.target.value)} />
            <Input placeholder="SKU starts with…" value={skuPrefix} onChange={e => setSkuPrefix(e.target.value)} />
            <Input placeholder="Name contains…" value={nameContains} onChange={e => setNameContains(e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} /> Preview only</label>
            <Button onClick={apply} disabled={loading}>{loading ? 'Applying…' : 'Apply'}</Button>
            <input type="file" accept="text/csv" onChange={uploadCSV} />
          </div>
          {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
          {changes.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Old</TableHead>
                  <TableHead>New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>{c.productId}</TableCell>
                    <TableCell>{c.oldPrice}</TableCell>
                    <TableCell>{c.newPrice}</TableCell>
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


