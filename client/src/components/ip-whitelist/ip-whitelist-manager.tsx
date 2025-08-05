import React, { useState } from 'react';
import { useIpWhitelist } from '../../hooks/use-ip-whitelist';
import { useAuth } from '../../hooks/use-auth';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useToast } from '../../hooks/use-toast';

interface User {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role: 'cashier' | 'manager' | 'admin';
  storeId?: string;
}

export function IpWhitelistManager() {
  const { whitelist, logs, loading, error, addIpToWhitelist, removeIpFromWhitelist } = useIpWhitelist();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newIpAddress, setNewIpAddress] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [description, setDescription] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  // Mock users - in a real app, this would come from an API
  const mockUsers: User[] = [
    { id: '1', username: 'admin', firstName: 'Admin', lastName: 'User', role: 'admin' },
    { id: '2', username: 'manager', firstName: 'Store', lastName: 'Manager', role: 'manager', storeId: 'store1' },
    { id: '3', username: 'cashier', firstName: 'POS', lastName: 'Cashier', role: 'cashier', storeId: 'store1' },
  ];

  const handleAddIp = async () => {
    if (!newIpAddress || !selectedUserId) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      await addIpToWhitelist(newIpAddress, selectedUserId, description);
      toast({
        title: "Success",
        description: "IP address added to whitelist",
      });
      setIsAddDialogOpen(false);
      setNewIpAddress('');
      setSelectedUserId('');
      setDescription('');
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to add IP to whitelist",
        variant: "destructive",
      });
    }
  };

  const handleRemoveIp = async (ipAddress: string, userId: string) => {
    try {
      await removeIpFromWhitelist(ipAddress, userId);
      toast({
        title: "Success",
        description: "IP address removed from whitelist",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to remove IP from whitelist",
        variant: "destructive",
      });
    }
  };

  const getFilteredUsers = () => {
    if (!user) return [];
    
    if (user.role === 'admin') {
      return mockUsers;
    } else if (user.role === 'manager') {
      // Managers can only whitelist cashiers in their stores
      return mockUsers.filter(u => u.role === 'cashier' && u.storeId === user.storeId);
    }
    
    return [];
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'manager': return 'bg-blue-100 text-blue-800';
      case 'cashier': return 'bg-green-100 text-green-800';
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
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add IP Address</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add IP to Whitelist</DialogTitle>
              <DialogDescription>
                Add an IP address to the whitelist for a specific user
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
                <Label htmlFor="userId">User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {getFilteredUsers().map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.username}) - {user.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Button onClick={handleAddIp}>Add IP</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
          ) : whitelist.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              No IP addresses are currently whitelisted
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {whitelist.map((item) => {
                  const user = mockUsers.find(u => u.id === item.whitelistedFor);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono">{item.ipAddress}</TableCell>
                      <TableCell>
                        {user ? `${user.firstName} ${user.lastName} (${user.username})` : 'Unknown User'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(item.role)}>
                          {item.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.description || '-'}</TableCell>
                      <TableCell>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveIp(item.ipAddress, item.whitelistedFor)}
                        >
                          Remove
                        </Button>
                      </TableCell>
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