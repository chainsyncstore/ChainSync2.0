import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export default function AdminUsersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setRows(data.users || []);
    } catch (e: any) {
      console.error('Failed to load admin users', e);
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createUser() {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, isAdmin }),
      });
      if (!res.ok) throw new Error('Failed to create user');
      setEmail(''); setPassword(''); setIsAdmin(false);
      await load();
    } catch (e: any) {
      console.error('Failed to create admin user', e);
      alert(e?.message || 'Create failed');
    }
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.status !== 204) throw new Error('Failed to delete user');
      await load();
    } catch (e: any) {
      console.error('Failed to delete admin user', e);
      alert(e?.message || 'Delete failed');
    }
  }

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
            <Input placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Admin</label>
            <Button onClick={createUser}>Create</Button>
          </div>
          {loading ? <div className="text-sm text-gray-500">Loading…</div> : error ? <div className="text-sm text-red-600">{error}</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.isAdmin ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{r.requires2fa ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Button variant="destructive" onClick={() => deleteUser(r.id)}>Delete</Button>
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


