import { Download, Shield, Bell, Database, Settings as SettingsIcon } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'react-qr-code';
import type { Store } from '@shared/schema';
import { IpWhitelistManager } from '../components/ip-whitelist/ip-whitelist-manager';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '../hooks/use-toast';

export default function Settings() {
  const { user, logout, twoFactorEnabled, setupTwoFactor, verifyTwoFactor, disableTwoFactor } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  // Password change form state
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState({ lowStockAlerts: false, salesReports: false, systemUpdates: false });
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    companyName: user?.companyName || '',
    location: user?.location || '',
    password: '', // for re-auth if email changes
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Two-factor authentication state
  const [isStartingTwoFactor, setIsStartingTwoFactor] = useState(false);
  const [isVerifyingTwoFactor, setIsVerifyingTwoFactor] = useState(false);
  const [twoFactorDialogOpen, setTwoFactorDialogOpen] = useState(false);
  const [twoFactorOtpauth, setTwoFactorOtpauth] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisablingTwoFactor, setIsDisablingTwoFactor] = useState(false);

  const isCashier = user?.role === 'cashier';

  const twoFactorSecret = useMemo(() => {
    if (!twoFactorOtpauth) return '';
    const secretMatch = twoFactorOtpauth.match(/secret=([^&]+)/i);
    return secretMatch ? decodeURIComponent(secretMatch[1]) : '';
  }, [twoFactorOtpauth]);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const response = await fetch('/api/stores');
        if (response.ok) {
          const storesData = await response.json();
          setStores(storesData);
          const defaultStoreId = user?.storeId || (storesData.length > 0 ? storesData[0].id : '');
          setSelectedStoreId(defaultStoreId);
        }
      } catch (error) {
        console.error('Failed to fetch stores:', error);
      }
    };

    if (user) {
      void fetchStores();

      const fetchSettings = async () => {
        try {
          const response = await fetch('/api/settings');
          if (response.ok) {
            const settings = await response.json();
            setNotificationSettings(settings.notifications || { lowStockAlerts: false, salesReports: false, systemUpdates: false });
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      };
      void fetchSettings();
    }
  }, [user]);

  const handleBeginTwoFactorSetup = async () => {
    if (twoFactorEnabled) {
      toast({ title: '2FA already enabled', description: 'Two-factor authentication is currently active for your account.' });
      return;
    }
    setIsStartingTwoFactor(true);
    try {
      const result = await setupTwoFactor();
      if (!result?.otpauth) {
        throw new Error('Failed to retrieve 2FA setup details.');
      }
      setTwoFactorOtpauth(result.otpauth);
      setTwoFactorCode('');
      setTwoFactorDialogOpen(true);
      toast({ title: '2FA setup started', description: 'Scan the code or enter the setup key in your authenticator app.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Could not start 2FA setup.', variant: 'destructive' });
    } finally {
      setIsStartingTwoFactor(false);
    }
  };

  const handleDisableDialogChange = (open: boolean) => {
    setDisableDialogOpen(open);
    if (!open) {
      setDisablePassword('');
      setIsDisablingTwoFactor(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!twoFactorCode.trim()) {
      toast({ title: 'Verification required', description: 'Enter the 6-digit code from your authenticator app.', variant: 'destructive' });
      return;
    }
    setIsVerifyingTwoFactor(true);
    try {
      const success = await verifyTwoFactor(twoFactorCode.trim());
      if (!success) {
        throw new Error('Invalid 2FA code. Please try again.');
      }
      toast({ title: '2FA enabled', description: 'Two-factor authentication has been enabled for your account.' });
      setTwoFactorDialogOpen(false);
      setTwoFactorOtpauth(null);
      setTwoFactorCode('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to verify 2FA code.', variant: 'destructive' });
    } finally {
      setIsVerifyingTwoFactor(false);
    }
  };

  const handleTwoFactorSwitch = (checked: boolean) => {
    if (checked) {
      if (!twoFactorEnabled) {
        void handleBeginTwoFactorSetup();
      }
      return;
    }

    if (twoFactorEnabled) {
      setDisableDialogOpen(true);
    }
  };

  const handleCopyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied', description: `${label} copied to clipboard.` });
    } catch {
      toast({ title: 'Copy failed', description: `Unable to copy ${label}.`, variant: 'destructive' });
    }
  };

  const handleTwoFactorDialogChange = (open: boolean) => {
    if (!open) {
      setTwoFactorDialogOpen(false);
      setTwoFactorOtpauth(null);
      setTwoFactorCode('');
      setIsVerifyingTwoFactor(false);
    } else {
      setTwoFactorDialogOpen(true);
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!disablePassword.trim()) {
      toast({ title: 'Password required', description: 'Please enter your current password to disable 2FA.', variant: 'destructive' });
      return;
    }
    setIsDisablingTwoFactor(true);
    try {
      const success = await disableTwoFactor(disablePassword.trim());
      if (!success) {
        throw new Error('Incorrect password or unable to disable 2FA.');
      }
      toast({ title: '2FA disabled', description: 'Two-factor authentication has been disabled for your account.' });
      setDisableDialogOpen(false);
      setDisablePassword('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to disable 2FA.', variant: 'destructive' });
    } finally {
      setIsDisablingTwoFactor(false);
    }
  };

  useEffect(() => {
    setProfileForm({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      companyName: user?.companyName || '',
      location: user?.location || '',
      password: '',
    });
  }, [user]);

  if (!user) {
    return <div>Loading...</div>;
  }
  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match.", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/auth/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const details = errorData?.details?.fieldErrors ?? {};
        const detailMessage = Object.values(details)[0]?.[0];
        const message = detailMessage || errorData?.error || errorData?.message || 'Failed to change password';
        throw new Error(message);
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
      console.error('Failed to save notification settings', error);
      toast({ title: "Error", description: "Could not save notification settings.", variant: "destructive" });
    } finally {
      setIsSavingNotifications(false);
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
      console.error('Failed to export data set', type, error);
      toast({ title: 'Export Failed', description: `Failed to export ${type} data. Please try again.`, variant: "destructive" });
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
      console.error('Failed to delete account', error);
      toast({ title: 'Deletion failed', description: 'Unable to delete account. Try again.', variant: 'destructive' });
      setIsDeleting(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const response = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }
      toast({ title: 'Success', description: 'Profile updated successfully.' });
      setProfileForm(f => ({ ...f, password: '' }));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600">System configuration and user preferences</p>
      </div>

      <Tabs defaultValue="security" className="space-y-6">
        <TabsList className={`grid w-full ${isCashier ? 'grid-cols-1' : 'grid-cols-4'}`}>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          {!isCashier && (
            <>
              <TabsTrigger value="notifications" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="data" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Data
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex items-center gap-2">
                <SettingsIcon className="h-4 w-4" />
                Profile
              </TabsTrigger>
            </>
          )}
        </TabsList>

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
                <div className="flex items-center gap-3">
                  <Badge variant={twoFactorEnabled ? 'default' : 'secondary'}>
                    {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Switch
                    checked={twoFactorEnabled}
                    onCheckedChange={handleTwoFactorSwitch}
                    disabled={isStartingTwoFactor || isVerifyingTwoFactor}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-600">
                  {twoFactorEnabled
                    ? 'Two-factor authentication is active on your account.'
                    : 'Start the setup wizard to enable two-factor authentication.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={handleBeginTwoFactorSetup}
                    disabled={twoFactorEnabled || isStartingTwoFactor}
                  >
                    {isStartingTwoFactor ? 'Preparing…' : twoFactorEnabled ? '2FA Enabled' : 'Setup 2FA'}
                  </Button>
                  {twoFactorEnabled && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDisableDialogOpen(true)}
                      disabled={isDisablingTwoFactor}
                    >
                      {isDisablingTwoFactor ? 'Disabling…' : 'Disable 2FA'}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Dialog open={twoFactorDialogOpen} onOpenChange={handleTwoFactorDialogChange}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set up Two-Factor Authentication</DialogTitle>
                <DialogDescription>
                  Scan the QR code in your authenticator app or enter the setup key manually. Then provide the 6-digit code generated by the app.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {twoFactorOtpauth && (
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <div className="rounded-md border p-4 bg-white">
                        <QRCode value={twoFactorOtpauth} size={164} />
                      </div>
                    </div>
                    <Label>Setup key</Label>
                    <div className="flex items-center gap-2">
                      <Input value={twoFactorSecret} readOnly />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleCopyToClipboard(twoFactorSecret, 'setup key')}
                        disabled={!twoFactorSecret}
                      >
                        Copy
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600">
                      Use your authenticator app&apos;s “Enter a setup key” option and paste the key above. If your app supports QR codes, you can also copy the provisioning URI below.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input value={twoFactorOtpauth} readOnly />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleCopyToClipboard(twoFactorOtpauth, 'provisioning URI')}
                      >
                        Copy URI
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="twoFactorCode">Authenticator code</Label>
                  <Input
                    id="twoFactorCode"
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    maxLength={8}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <Button type="button" variant="outline" onClick={() => handleTwoFactorDialogChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleVerifyTwoFactor} disabled={isVerifyingTwoFactor}>
                  {isVerifyingTwoFactor ? 'Verifying…' : 'Verify & Enable'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={disableDialogOpen} onOpenChange={handleDisableDialogChange}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
                <DialogDescription>
                  Enter your current password to confirm disabling two-factor authentication.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="disableTwoFactorPassword">Current password</Label>
                  <Input
                    id="disableTwoFactorPassword"
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <Button type="button" variant="outline" onClick={() => setDisableDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDisableTwoFactor} disabled={isDisablingTwoFactor}>
                  {isDisablingTwoFactor ? 'Disabling…' : 'Disable 2FA'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {user.role !== 'cashier' && (
            <Card>
              <CardHeader>
                <CardTitle>IP Whitelist</CardTitle>
                <CardDescription>Restrict access to specific IP addresses</CardDescription>
              </CardHeader>
              <CardContent>
                <IpWhitelistManager stores={stores} />
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

        {!isCashier && (
          <>
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

            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Update your personal details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={profileForm.firstName} onChange={e => setProfileForm({ ...profileForm, firstName: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={profileForm.lastName} onChange={e => setProfileForm({ ...profileForm, lastName: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="companyName">Company</Label>
                    <Input id="companyName" value={profileForm.companyName} onChange={e => setProfileForm({ ...profileForm, companyName: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" value={profileForm.location} onChange={e => setProfileForm({ ...profileForm, location: e.target.value })} />
                  </div>
                  {profileForm.email !== user.email && (
                    <div>
                      <Label htmlFor="password">Current Password (required to change email)</Label>
                      <Input id="password" type="password" value={profileForm.password} onChange={e => setProfileForm({ ...profileForm, password: e.target.value })} />
                    </div>
                  )}
                  <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? 'Saving...' : 'Save Profile'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
