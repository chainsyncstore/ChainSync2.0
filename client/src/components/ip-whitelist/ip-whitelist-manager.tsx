import React, { useMemo, useState } from 'react';
import type { Store } from '@shared/schema';
import { useAuth } from '../../hooks/use-auth';
import { useIpWhitelist, type WhitelistRole } from '../../hooks/use-ip-whitelist';
import { useToast } from '../../hooks/use-toast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/notice';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface IpWhitelistManagerProps {
  stores: Store[];
}

const ROLE_OPTIONS: { label: string; value: WhitelistRole }[] = [
  { label: 'Managers', value: 'MANAGER' },
  { label: 'Cashiers', value: 'CASHIER' },
];

const formatRole = (role: WhitelistRole) => role.charAt(0) + role.slice(1).toLowerCase();

export function IpWhitelistManager({ stores }: IpWhitelistManagerProps) {
  const { whitelist, logs, loading, error, addStoreIpToWhitelist, removeIpFromWhitelist } = useIpWhitelist();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newIpAddress, setNewIpAddress] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<WhitelistRole[]>(['MANAGER', 'CASHIER']);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequirementsDialogOpen, setIsRequirementsDialogOpen] = useState(false);

  const isAdmin = Boolean((user as any)?.isAdmin || user?.role === 'admin');
  const requiresStoreSetup = isAdmin && stores.length === 0;

  const storeLookup = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach(store => {
      if (store.id) {
        map.set(store.id, store.name ?? 'Untitled store');
      }
    });
    return map;
  }, [stores]);

  const sortedWhitelist = useMemo(() => {
    return [...whitelist].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [whitelist]);

  const toggleRole = (role: WhitelistRole) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleAddIp = async () => {
    if (!newIpAddress || !selectedStoreId || selectedRoles.length === 0) {
      toast({
        title: "Error",
        description: "Please provide an IP address, store, and at least one role",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await addStoreIpToWhitelist(
        newIpAddress.trim(),
        selectedStoreId,
        selectedRoles,
        description.trim() || undefined,
      );

      toast({
        title: "Success",
        description: "IP address added to whitelist",
      });
      setIsAddDialogOpen(false);
      setNewIpAddress('');
      setSelectedStoreId('');
      setSelectedRoles(['MANAGER', 'CASHIER']);
      setDescription('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add IP to whitelist';
      console.error('Failed to add IP', err);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveIp = async (ipAddress: string, userId: string) => {
    try {
      await removeIpFromWhitelist(userId);
      toast({
        title: "Success",
        description: "IP address removed from whitelist",
      });
    } catch (err) {
      console.error('Failed to remove IP from whitelist', err);
      toast({
        title: "Error",
        description: "Failed to remove IP from whitelist",
        variant: "destructive",
      });
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-800';
      case 'MANAGER': return 'bg-blue-100 text-blue-800';
      case 'CASHIER': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (user?.role === 'cashier') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>IP Whitelist</CardTitle>
          <CardDescription>Your whitelisted IP addresses</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Cashiers cannot manage IP whitelists. Contact your manager or administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">IP Whitelist Management</h2>
          <p className="text-gray-600">
            Manage IP addresses that are allowed to access the system
          </p>
        </div>
        
        {isAdmin && (
          requiresStoreSetup ? (
            <>
              <Button onClick={() => setIsRequirementsDialogOpen(true)}>Add IP Address</Button>
              <Dialog open={isRequirementsDialogOpen} onOpenChange={setIsRequirementsDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Store setup required</DialogTitle>
                    <DialogDescription>
                      Create at least one store before whitelisting IP addresses for staff access.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 text-sm text-gray-700">
                    <p>To add an IP address you need:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>An active store under your organization.</li>
                      <li>Roles (manager or cashier) that should use the IP.</li>
                    </ul>
                    <p>Head over to the Stores tab to create a store, then return to whitelist the IP.</p>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => setIsRequirementsDialogOpen(false)}>Got it</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (open) {
                setSelectedStoreId(prev => prev || stores[0]?.id || '');
              }
            }}>
              <DialogTrigger asChild>
                <Button>Add IP Address</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add IP to Whitelist</DialogTitle>
                  <DialogDescription>
                    Add an IP address that will be allowed for selected store roles.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="ipAddress">IP Address</Label>
                    <Input
                      id="ipAddress"
                      value={newIpAddress}
                      onChange={(e) => setNewIpAddress(e.target.value)}
                      placeholder="192.168.1.100"
                    />
                  </div>

                  <div>
                    <Label htmlFor="storeId">Store</Label>
                    <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a store" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.length === 0 ? (
                          <SelectItem value="" disabled>
                            No stores available
                          </SelectItem>
                        ) : (
                          stores.map(store => (
                            <SelectItem key={store.id} value={store.id}>
                              {store.name || 'Untitled store'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Allowed roles</Label>
                    <div className="flex gap-4 flex-wrap mt-2">
                      {ROLE_OPTIONS.map(option => (
                        <label key={option.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selectedRoles.includes(option.value)}
                            onChange={() => toggleRole(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Input
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g., Office computer, Mobile device"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddIp} disabled={isSubmitting}>
                    {isSubmitting ? 'Adding…' : 'Add IP'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        )}
      </div>

      {requiresStoreSetup && (
        <Alert>
          <AlertDescription>
            You need to create at least one store before adding IP addresses for your staff. Visit the Stores tab to add a store, then return here to whitelist IPs.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Whitelisted IP Addresses</CardTitle>
          <CardDescription>
            {user?.role === 'admin' 
              ? 'All whitelisted IP addresses across the system'
              : user?.role === 'manager'
              ? 'Whitelisted IP addresses for your store'
              : 'Your whitelisted IP addresses'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : sortedWhitelist.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              No IP addresses are currently whitelisted
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Added</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWhitelist.map((item) => {
                  const storeName = item.storeId ? storeLookup.get(item.storeId) ?? 'Store' : '-';
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono">{item.ipAddress}</TableCell>
                      <TableCell className="capitalize">{item.scope || (item.storeId ? 'store' : 'user')}</TableCell>
                      <TableCell>{storeName}</TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(item.role)}>
                          {formatRole(item.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.description || '-'}</TableCell>
                      <TableCell>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveIp(item.ipAddress, item.id)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle>IP Access Logs</CardTitle>
            <CardDescription>Recent IP access attempts and whitelist changes</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No access logs available
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono">{log.ipAddress}</TableCell>
                      <TableCell>{log.username || '-'}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell>
                        <Badge variant={log.success ? "default" : "destructive"}>
                          {log.success ? 'Success' : 'Failed'}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.reason || '-'}</TableCell>
                      <TableCell>
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}