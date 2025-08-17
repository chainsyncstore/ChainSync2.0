import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminIpWhitelistPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'ADMIN'|'MANAGER'|'CASHIER'>('CASHIER');
  const [cidrOrIp, setCidrOrIp] = useState('');
  const [label, setLabel] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ip-whitelist', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch whitelist');
      const data = await res.json();
      setRows(data.whitelist || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load whitelist');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function addEntry() {
    try {
      const res = await fetch('/api/admin/ip-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, cidrOrIp, label }),
      });
      if (!res.ok) throw new Error('Failed to add entry');
      setCidrOrIp(''); setLabel('');
      await load();
    } catch (e: any) {
      alert(e?.message || 'Add failed');
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`/api/admin/ip-whitelist/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.status !== 204) throw new Error('Failed to delete entry');
      await load();
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>IP Whitelist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 items-center">
            <select className="border px-2 py-1 rounded" value={role} onChange={e => setRole(e.target.value as any)}>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="CASHIER">CASHIER</option>
            </select>
            <Input placeholder="CIDR or IP" value={cidrOrIp} onChange={e => setCidrOrIp(e.target.value)} />
            <Input placeholder="Label" value={label} onChange={e => setLabel(e.target.value)} />
            <Button onClick={addEntry}>Add</Button>
          </div>
          {loading ? <div className="text-sm text-gray-500">Loading…</div> : error ? <div className="text-sm text-red-600">{error}</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>CIDR/IP</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.role}</TableCell>
                    <TableCell>{r.cidrOrIp}</TableCell>
                    <TableCell>{r.label || '—'}</TableCell>
                    <TableCell>
                      <Button variant="destructive" onClick={() => deleteEntry(r.id)}>Delete</Button>
                    </TableCell>
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


