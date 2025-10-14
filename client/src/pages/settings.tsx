import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { IpWhitelistManager } from '../components/ip-whitelist/ip-whitelist-manager';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Download, Store as StoreIcon, Users, Shield, Bell, Database, Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import type { Store } from '@shared/schema';

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  // Store settings form state
  const [storeInfo, setStoreInfo] = useState({ name: '', address: '', phone: '', email: '' });
  const [isSavingStore, setIsSavingStore] = useState(false);

  // Password change form state
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState({ lowStockAlerts: false, salesReports: false, systemUpdates: false });
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  // Integration settings state
  const [integrationSettings, setIntegrationSettings] = useState({ paymentGateway: false, accountingSoftware: false, emailMarketing: false });
  const [isSavingIntegrations, setIsSavingIntegrations] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const response = await fetch('/api/stores');
        if (response.ok) {
          const storesData = await response.json();
          setStores(storesData);
          // Use user's storeId or first available store
          const defaultStoreId = user?.storeId || (storesData.length > 0 ? storesData[0].id : '');
          setSelectedStoreId(defaultStoreId);
        }
      } catch (error) {
        console.error('Failed to fetch stores:', error);
      }
    };

    if (user) {
      fetchStores();

      const fetchSettings = async () => {
        try {
          const response = await fetch('/api/settings');
          if (response.ok) {
            const settings = await response.json();
            setNotificationSettings(settings.notifications || { lowStockAlerts: false, salesReports: false, systemUpdates: false });
            setIntegrationSettings(settings.integrations || { paymentGateway: false, accountingSoftware: false, emailMarketing: false });
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      };
      fetchSettings();
    }
  }, [user]);

  useEffect(() => {
    const selectedStore = stores.find(s => s.id === selectedStoreId);
    if (selectedStore) {
      setStoreInfo({
        name: selectedStore.name || '',
        address: selectedStore.address || '',
        phone: (selectedStore as any).phone || '',
        email: (selectedStore as any).email || ''
      });
    }
  }, [selectedStoreId, stores]);

  if (!user) {
    return <div>Loading...</div>;
  }

  const handleSaveStoreSettings = async () => {
    if (!selectedStoreId) {
      toast({ title: "Error", description: "No store selected.", variant: "destructive" });
      return;
    }
    setIsSavingStore(true);
    try {
      const response = await fetch(`/api/stores/${selectedStoreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeInfo),
      });
      if (!response.ok) throw new Error('Failed to save store settings');
      toast({ title: "Success", description: "Store settings saved successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save store settings.", variant: "destructive" });
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match.", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to change password');
      }
      toast({ title: "Success", description: "Password changed successfully." });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    setIsSavingNotifications(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: notificationSettings }),
      });
      if (!response.ok) throw new Error('Failed to save notification settings');
      toast({ title: "Success", description: "Notification settings saved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save notification settings.", variant: "destructive" });
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleSaveIntegrationSettings = async () => {
    setIsSavingIntegrations(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations: integrationSettings }),
      });
      if (!response.ok) throw new Error('Failed to save integration settings');
      toast({ title: "Success", description: "Integration settings saved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save integration settings.", variant: "destructive" });
    } finally {
      setIsSavingIntegrations(false);
    }
  };

  const handleExport = async (type: string) => {
    if (!selectedStoreId) {
      toast({
        title: "Error",
        description: "No store selected for export. Please select a store first.",
        variant: "destructive",
      });
      return;
    }

    setExporting(type);
    try {
      let url = `/api/stores/${selectedStoreId}/export/${type}?format=csv`;
      
      // Add date range for transactions
      if (type === 'transactions') {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // Last 30 days
        url += `&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${type}-export.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Export Successful",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} data has been exported successfully.`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: `Failed to export ${type} data. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'Delete') {
      toast({
        title: 'Confirmation required',
        description: "Type 'Delete' exactly to confirm.",
        variant: 'destructive',
      });
      return;
    }
    if (!user?.id) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Account deleted', description: 'Your account has been permanently deleted.' });
      await logout();
    } catch (error) {
      toast({ title: 'Deletion failed', description: 'Unable to delete account. Try again.', variant: 'destructive' });
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600">System configuration and user preferences</p>
      </div>

      <Tabs defaultValue="store" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="store" className="flex items-center gap-2">
                          <StoreIcon className="h-4 w-4" />
            Store
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="store" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Store Information</CardTitle>
              <CardDescription>Manage your store details and configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="storeName">Store Name</Label>
                <Input id="storeName" value={storeInfo.name} onChange={e => setStoreInfo({ ...storeInfo, name: e.target.value })} />
              </div>
              
              <div>
                <Label htmlFor="storeAddress">Address</Label>
                <Input id="storeAddress" value={storeInfo.address} onChange={e => setStoreInfo({ ...storeInfo, address: e.target.value })} />
              </div>
              
              <div>
                <Label htmlFor="storePhone">Phone</Label>
                <Input id="storePhone" value={storeInfo.phone} onChange={e => setStoreInfo({ ...storeInfo, phone: e.target.value })} />
              </div>
              
              <div>
                <Label htmlFor="storeEmail">Email</Label>
                <Input id="storeEmail" type="email" value={storeInfo.email} onChange={e => setStoreInfo({ ...storeInfo, email: e.target.value })} />
              </div>
              
              <Button onClick={handleSaveStoreSettings} disabled={isSavingStore}>
                {isSavingStore ? 'Saving...' : 'Save Store Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage user accounts and permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">User Registration</p>
                  <p className="text-sm text-gray-600">Allow new users to register</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Email Verification</p>
                  <p className="text-sm text-gray-600">Require email verification for new users</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Button variant="outline">Manage Users</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input id="currentPassword" type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
              </div>
              
              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
              </div>
              
              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input id="confirmPassword" type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
              </div>
              
              <Button onClick={handleChangePassword} disabled={isChangingPassword}>
                {isChangingPassword ? 'Changing...' : 'Change Password'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>Add an extra layer of security to your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable 2FA</p>
                  <p className="text-sm text-gray-600">Use an authenticator app for additional security</p>
                </div>
                <Switch />
              </div>
              
              <Button variant="outline">Setup 2FA</Button>
            </CardContent>
          </Card>

          {user.role !== 'cashier' && (
            <Card>
              <CardHeader>
                <CardTitle>IP Whitelist</CardTitle>
                <CardDescription>Restrict access to specific IP addresses</CardDescription>
              </CardHeader>
              <CardContent>
                <IpWhitelistManager />
              </CardContent>
            </Card>
          )}

          {user.role === 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Delete Account</CardTitle>
                <CardDescription>
                  Permanently delete your admin account. This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label htmlFor="deleteConfirm" className="whitespace-nowrap">Type Delete to confirm</Label>
                  <Input
                    id="deleteConfirm"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="Delete"
                  />
                  <Button
                    variant="destructive"
                    disabled={deleteConfirm !== 'Delete' || isDeleting}
                    onClick={handleDeleteAccount}
                  >
                    {isDeleting ? 'Deleting…' : 'Delete Account'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Low Stock Alerts</p>
                  <p className="text-sm text-gray-600">Get notified when inventory is running low</p>
                </div>
                <Switch checked={notificationSettings.lowStockAlerts} onCheckedChange={checked => setNotificationSettings({ ...notificationSettings, lowStockAlerts: checked })} />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sales Reports</p>
                  <p className="text-sm text-gray-600">Receive daily sales summaries</p>
                </div>
                <Switch checked={notificationSettings.salesReports} onCheckedChange={checked => setNotificationSettings({ ...notificationSettings, salesReports: checked })} />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">System Updates</p>
                  <p className="text-sm text-gray-600">Get notified about system maintenance and updates</p>
                </div>
                <Switch checked={notificationSettings.systemUpdates} onCheckedChange={checked => setNotificationSettings({ ...notificationSettings, systemUpdates: checked })} />
              </div>
              
              <Button onClick={handleSaveNotificationSettings} disabled={isSavingNotifications}>
                {isSavingNotifications ? 'Saving...' : 'Save Preferences'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Third-Party Integrations</CardTitle>
              <CardDescription>Connect with external services and platforms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Payment Gateway</p>
                  <p className="text-sm text-gray-600">Connect to Paystack/Flutterwave for payment processing</p>
                </div>
                <Switch checked={integrationSettings.paymentGateway} onCheckedChange={checked => setIntegrationSettings({ ...integrationSettings, paymentGateway: checked })} />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Accounting Software</p>
                  <p className="text-sm text-gray-600">Sync with QuickBooks for accounting</p>
                </div>
                <Switch checked={integrationSettings.accountingSoftware} onCheckedChange={checked => setIntegrationSettings({ ...integrationSettings, accountingSoftware: checked })} />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Email Marketing</p>
                  <p className="text-sm text-gray-600">Connect to Mailchimp for email campaigns</p>
                </div>
                <Switch checked={integrationSettings.emailMarketing} onCheckedChange={checked => setIntegrationSettings({ ...integrationSettings, emailMarketing: checked })} />
              </div>
              
              <Button onClick={handleSaveIntegrationSettings} disabled={isSavingIntegrations}>
                {isSavingIntegrations ? 'Saving...' : 'Configure Integrations'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Export</CardTitle>
              <CardDescription>Export your data for backup or analysis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user.role === 'admin' && stores.length > 1 && (
                <div>
                  <Label htmlFor="store-select">Select Store</Label>
                  <select
                    id="store-select"
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md mt-1"
                  >
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2"
                  onClick={() => handleExport('products')}
                  disabled={exporting === 'products'}
                >
                  <Download className="h-4 w-4" />
                  {exporting === 'products' ? 'Exporting...' : 'Export Products'}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2"
                  onClick={() => handleExport('transactions')}
                  disabled={exporting === 'transactions'}
                >
                  <Download className="h-4 w-4" />
                  {exporting === 'transactions' ? 'Exporting...' : 'Export Transactions'}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2"
                  onClick={() => handleExport('customers')}
                  disabled={exporting === 'customers'}
                >
                  <Download className="h-4 w-4" />
                  {exporting === 'customers' ? 'Exporting...' : 'Export Customers'}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2"
                  onClick={() => handleExport('inventory')}
                  disabled={exporting === 'inventory'}
                >
                  <Download className="h-4 w-4" />
                  {exporting === 'inventory' ? 'Exporting...' : 'Export Inventory'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
