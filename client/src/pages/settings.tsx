import { AlertCircle, Download, Shield, Bell, Database, Settings as SettingsIcon } from 'lucide-react';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { getCsrfToken } from '@/lib/csrf';
import type { NotificationChannels, NotificationScope } from '@/types/notifications';
import { defaultNotificationSettings, normalizeNotificationSettingsPayload } from '@/types/notifications';
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
import { useDesktopNotifications } from '../hooks/use-desktop-notifications';
import { useToast } from '../hooks/use-toast';

export default function Settings() {
  const {
    user,
    logout,
    twoFactorEnabled,
    setupTwoFactor,
    verifyTwoFactor,
    disableTwoFactor,
    requestProfileOtp,
    verifyProfileOtp,
    refreshUser,
  } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  // Password change form state
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState<NotificationChannels>(defaultNotificationSettings);
  const [notificationScope, setNotificationScope] = useState<NotificationScope | null>(null);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [orgSecurity, setOrgSecurity] = useState<{ ipWhitelistEnforced: boolean } | null>(null);
  const [orgSecurityLoading, setOrgSecurityLoading] = useState(false);
  const [orgSecuritySaving, setOrgSecuritySaving] = useState(false);
  const [orgSecurityError, setOrgSecurityError] = useState<string | null>(null);
  const [ipWhitelistWarningOpen, setIpWhitelistWarningOpen] = useState(false);
  const [pendingIpWhitelistValue, setPendingIpWhitelistValue] = useState<boolean | null>(null);

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
  const [profileOtpCode, setProfileOtpCode] = useState('');
  const [profileOtpStatus, setProfileOtpStatus] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [profileOtpExpiresAt, setProfileOtpExpiresAt] = useState<Date | null>(null);
  const [profileOtpEmail, setProfileOtpEmail] = useState('');
  const [isRequestingProfileOtp, setIsRequestingProfileOtp] = useState(false);
  const [isVerifyingProfileOtp, setIsVerifyingProfileOtp] = useState(false);
  const [profileOtpTick, setProfileOtpTick] = useState(0);

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
  const isManager = user?.role === 'manager';

  const {
    permission: desktopPermission,
    supportsNotifications,
    canNotify: desktopCanNotify,
    requestPermission: requestDesktopPermission,
    sendPreviewNotification,
  } = useDesktopNotifications({ disabled: isCashier });

  const desktopPermissionLabel = useMemo(() => {
    if (!supportsNotifications) {
      return 'This browser does not support system notifications.';
    }
    if (desktopPermission === 'granted') {
      return 'Ready – alerts will appear in your device notification center.';
    }
    if (desktopPermission === 'denied') {
      return 'Blocked in browser settings. Allow notifications for chainsync.store to receive alerts.';
    }
    return 'Permission not requested yet.';
  }, [desktopPermission, supportsNotifications]);

  const handleRequestDesktopPermission = useCallback(async () => {
    const result = await requestDesktopPermission();
    if (result === 'granted') {
      toast({ title: 'Desktop notifications enabled', description: 'ChainSync alerts will use your OS notification center.' });
      return;
    }
    if (result === 'denied') {
      toast({
        title: 'Permission blocked',
        description: 'Enable notifications for chainsync.store in your browser settings to receive alerts.',
        variant: 'destructive',
      });
    }
  }, [requestDesktopPermission, toast]);

  const handlePreviewDesktopNotification = useCallback(() => {
    const sent = sendPreviewNotification();
    toast({
      title: sent ? 'Test alert sent' : 'Unable to send preview',
      description: sent ? 'Check your device notification center for the ChainSync test alert.' : 'Grant notification permission to preview alerts.',
      variant: sent ? 'default' : 'destructive',
    });
  }, [sendPreviewNotification, toast]);

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
            const normalizedNotifications = normalizeNotificationSettingsPayload(settings.notifications);
            setNotificationSettings(normalizedNotifications);
            if (settings.notificationScope) {
              setNotificationScope(settings.notificationScope as NotificationScope);
            }
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      };
      void fetchSettings();
    }
  }, [user]);

  const fetchOrgSecurity = useCallback(async () => {
    if (user?.role !== 'admin') {
      return;
    }
    setOrgSecurityLoading(true);
    setOrgSecurityError(null);
    try {
      const response = await fetch('/api/admin/org/security', { credentials: 'include' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to load security settings');
      }
      const data = await response.json();
      setOrgSecurity({ ipWhitelistEnforced: Boolean(data?.ipWhitelistEnforced) });
    } catch (error: any) {
      setOrgSecurityError(error?.message || 'Unable to load security settings');
    } finally {
      setOrgSecurityLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    void fetchOrgSecurity();
  }, [fetchOrgSecurity]);

  const applyIpWhitelistToggle = useCallback(async (checked: boolean) => {
    if (user?.role !== 'admin') {
      return;
    }
    setOrgSecuritySaving(true);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/admin/org/security', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ ipWhitelistEnforced: checked }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update security settings');
      }
      const data = await response.json();
      setOrgSecurity({ ipWhitelistEnforced: Boolean(data?.ipWhitelistEnforced) });
      toast({
        title: 'Security settings updated',
        description: checked
          ? 'IP whitelist enforcement is now enabled for your organization.'
          : 'IP whitelist enforcement is now disabled.',
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to update security settings', variant: 'destructive' });
    } finally {
      setOrgSecuritySaving(false);
    }
  }, [toast, user?.role]);

  const handleToggleIpWhitelist = useCallback((checked: boolean) => {
    if (checked) {
      setPendingIpWhitelistValue(true);
      setIpWhitelistWarningOpen(true);
      return;
    }
    void applyIpWhitelistToggle(false);
  }, [applyIpWhitelistToggle]);

  const handleConfirmIpWhitelistWarning = useCallback(async () => {
    setIpWhitelistWarningOpen(false);
    const nextValue = pendingIpWhitelistValue;
    setPendingIpWhitelistValue(null);
    if (nextValue === true) {
      await applyIpWhitelistToggle(true);
    }
  }, [applyIpWhitelistToggle, pendingIpWhitelistValue]);

  const handleDismissIpWhitelistWarning = useCallback(() => {
    setIpWhitelistWarningOpen(false);
    setPendingIpWhitelistValue(null);
  }, []);

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

  const resetProfileOtpState = useCallback(() => {
    setProfileOtpStatus('idle');
    setProfileOtpCode('');
    setProfileOtpExpiresAt(null);
    setProfileOtpEmail('');
    setIsRequestingProfileOtp(false);
    setIsVerifyingProfileOtp(false);
  }, []);

  const normalizedCurrentEmail = useMemo(() => (user?.email ?? '').trim().toLowerCase(), [user?.email]);
  const normalizedPendingEmail = profileForm.email.trim().toLowerCase();
  const emailChanged = Boolean(profileForm.email && normalizedPendingEmail !== normalizedCurrentEmail);
  const otpVerified = profileOtpStatus === 'verified';
  const saveProfileDisabled = isSavingProfile || (emailChanged && !otpVerified);

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
    resetProfileOtpState();
  }, [user, resetProfileOtpState]);

  useEffect(() => {
    if (!emailChanged) {
      resetProfileOtpState();
    }
  }, [emailChanged, resetProfileOtpState]);

  useEffect(() => {
    if (!profileOtpExpiresAt) {
      setProfileOtpTick(0);
      return;
    }
    const interval = window.setInterval(() => {
      setProfileOtpTick((tick) => tick + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [profileOtpExpiresAt]);

  const profileOtpSecondsRemaining = useMemo(() => {
    if (!profileOtpExpiresAt) return null;
    // dependency tick ensures this recalculates once per second
    void profileOtpTick;
    return Math.max(0, Math.ceil((profileOtpExpiresAt.getTime() - Date.now()) / 1000));
  }, [profileOtpExpiresAt, profileOtpTick]);

  const profileOtpCountdownLabel = useMemo(() => {
    if (profileOtpSecondsRemaining === null) return null;
    const minutes = Math.floor(profileOtpSecondsRemaining / 60);
    const seconds = profileOtpSecondsRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [profileOtpSecondsRemaining]);

  const profileOtpExpired = Boolean(profileOtpExpiresAt && profileOtpSecondsRemaining === 0 && !otpVerified);
  const sendProfileOtpLabel = profileOtpStatus === 'idle' ? 'Send code' : profileOtpStatus === 'verified' ? 'Send new code' : 'Resend code';

  const handleRequestProfileOtp = async () => {
    if (!profileForm.email || !emailChanged) {
      toast({ title: 'Email required', description: 'Enter the new email before requesting a code.', variant: 'destructive' });
      return;
    }
    setIsRequestingProfileOtp(true);
    try {
      resetProfileOtpState();
      const response = await requestProfileOtp(profileForm.email);
      if (response?.expiresAt) {
        setProfileOtpExpiresAt(new Date(response.expiresAt));
      } else {
        setProfileOtpExpiresAt(null);
      }
      setProfileOtpEmail(profileForm.email.trim().toLowerCase());
      setProfileOtpStatus('sent');
      toast({ title: 'Code sent', description: 'Check your new email inbox for the verification code.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Could not send verification code.', variant: 'destructive' });
    } finally {
      setIsRequestingProfileOtp(false);
    }
  };

  const handleVerifyProfileOtp = async () => {
    if (!profileOtpCode.trim()) {
      toast({ title: 'Verification required', description: 'Enter the code that was emailed to you.', variant: 'destructive' });
      return;
    }
    if (profileOtpExpired) {
      toast({ title: 'Code expired', description: 'Please request a new verification code.', variant: 'destructive' });
      resetProfileOtpState();
      return;
    }
    setIsVerifyingProfileOtp(true);
    try {
      await verifyProfileOtp({ email: profileForm.email, code: profileOtpCode });
      setProfileOtpStatus('verified');
      toast({ title: 'Code verified', description: 'You can now save your new email.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Invalid or expired verification code.', variant: 'destructive' });
    } finally {
      setIsVerifyingProfileOtp(false);
    }
  };

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
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/auth/me/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
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
      const updated = await response.json().catch(() => null);
      if (updated?.notifications) {
        setNotificationSettings(normalizeNotificationSettingsPayload(updated.notifications));
      }
      if (updated?.notificationScope) {
        setNotificationScope(updated.notificationScope as NotificationScope);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chainsync:notifications-updated'));
      }
      toast({ title: "Success", description: "Notification settings saved." });
    } catch (error) {
      console.error('Failed to save notification settings', error);
      toast({ title: "Error", description: "Could not save notification settings.", variant: "destructive" });
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const updateNotificationChannel = (
    category: keyof NotificationChannels,
    channel: 'email' | 'inApp',
    value: boolean,
  ) => {
    setNotificationSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: value,
      },
    }));
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
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to delete account');
      }
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
      const csrfToken = await getCsrfToken();
      const payload = { ...profileForm };
      if (!payload.password.trim()) {
        delete payload.password;
      } else {
        payload.password = payload.password.trim();
      }
      const response = await fetch('/api/auth/me/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.message || 'Failed to update profile');
      }
      toast({ title: 'Success', description: 'Profile updated successfully.' });
      setProfileForm(f => ({ ...f, password: '' }));
      resetProfileOtpState();
      await refreshUser();
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
        <TabsList className={`grid w-full ${isCashier ? 'grid-cols-1' : isManager ? 'grid-cols-3' : 'grid-cols-4'}`}>
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
              {user?.role === 'admin' && (
                <TabsTrigger value="profile" className="flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4" />
                  Profile
                </TabsTrigger>
              )}
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
            <DialogContent className="sm:max-w-[360px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Set up Two-Factor Authentication</DialogTitle>
                <DialogDescription>
                  Scan the QR code in your authenticator app or enter the setup key manually. Then provide the 6-digit code generated by the app.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {twoFactorOtpauth && (
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <div className="rounded-md border p-3 bg-white">
                        <QRCode value={twoFactorOtpauth} size={128} />
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

          {user.role === 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle>Organization security</CardTitle>
                <CardDescription>Control whether managers and cashiers must log in from approved IPs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {orgSecurityError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {orgSecurityError}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Enforce IP whitelist</p>
                    <p className="text-sm text-muted-foreground">
                      {orgSecurity?.ipWhitelistEnforced
                        ? 'Only approved IPs can access non-admin accounts.'
                        : 'Managers and cashiers can log in from any IP.'}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(orgSecurity?.ipWhitelistEnforced)}
                    disabled={orgSecurityLoading || orgSecuritySaving}
                    onCheckedChange={handleToggleIpWhitelist}
                  />
                </div>
              </CardContent>
            </Card>
          )}

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

          <Dialog open={ipWhitelistWarningOpen} onOpenChange={(open) => {
            setIpWhitelistWarningOpen(open);
            if (!open) {
              setPendingIpWhitelistValue(null);
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>IP addresses can change unexpectedly</DialogTitle>
                <DialogDescription>
                  Mobile data and consumer broadband connections frequently rotate IP addresses, so enforcing an IP whitelist can require constant maintenance.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Enable this feature only if your staff operates from a static, business-grade connection. Otherwise, legitimate users may be locked out whenever their ISP reassigns their IP.
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Dynamic IPs (mobile hotspots, residential broadband) can change multiple times per day.</li>
                  <li>Each change will require an admin to update the whitelist before the team can log back in.</li>
                </ul>
              </div>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={handleDismissIpWhitelistWarning}>
                  Cancel
                </Button>
                <Button onClick={() => { void handleConfirmIpWhitelistWarning(); }}>
                  Enable anyway
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                  <CardDescription>Choose how you want ChainSync to contact you via email or desktop/device alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-md border border-dashed bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">Desktop & device notifications</p>
                        <p className="text-sm text-muted-foreground">{desktopPermissionLabel}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => { void handleRequestDesktopPermission(); }}
                          disabled={!supportsNotifications || desktopPermission === 'granted'}
                        >
                          Enable notifications
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handlePreviewDesktopNotification}
                          disabled={!desktopCanNotify}
                        >
                          Send test alert
                        </Button>
                      </div>
                    </div>
                    {!supportsNotifications ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        This device cannot display system notifications. Try a modern desktop browser (Chrome, Edge, Safari).
                      </p>
                    ) : desktopPermission === 'denied' ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Notifications are blocked. Update browser site settings to allow alerts from chainsync.store.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Alerts include ChainSync branding (logo + name) inside your operating system notification center.
                      </p>
                    )}
                  </div>

                  {notificationScope && (
                    <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                      <div>
                        {notificationScope.type === 'org' ? (
                          <p>Admin preferences apply to the entire organization.</p>
                        ) : (
                          <p>
                            Preferences apply to
                            {' '}
                            <strong>{notificationScope.storeName || 'your assigned store'}</strong> only.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="rounded-md border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">System health & maintenance</p>
                          <p className="text-sm text-muted-foreground">Sentry outages, required updates, security advisories (email)</p>
                        </div>
                        <Switch
                          checked={notificationSettings.systemHealth.email}
                          onCheckedChange={(checked) => updateNotificationChannel('systemHealth', 'email', checked)}
                        />
                      </div>
                    </div>

                    <div className="rounded-md border p-4">
                      <div className="flex flex-col gap-2">
                        <div>
                          <p className="font-medium">Store performance alerts</p>
                          <p className="text-sm text-muted-foreground">Background job summaries delivered via email and your device notification center</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex items-center justify-between rounded-md border p-3">
                            <div>
                              <p className="text-sm font-medium">Email</p>
                              <p className="text-xs text-muted-foreground">Daily/weekly rollups</p>
                            </div>
                            <Switch
                              checked={notificationSettings.storePerformance.email}
                              onCheckedChange={(checked) => updateNotificationChannel('storePerformance', 'email', checked)}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-md border p-3">
                            <div>
                              <p className="text-sm font-medium">Desktop & device</p>
                              <p className="text-xs text-muted-foreground">Pushes to the OS notification center</p>
                            </div>
                            <Switch
                              checked={notificationSettings.storePerformance.inApp}
                              onCheckedChange={(checked) => updateNotificationChannel('storePerformance', 'inApp', checked)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">Inventory risks</p>
                          <p className="text-sm text-muted-foreground">Critical low stock and stock-out alerts (desktop/device notifications)</p>
                        </div>
                        <Switch
                          checked={notificationSettings.inventoryRisks.inApp}
                          onCheckedChange={(checked) => updateNotificationChannel('inventoryRisks', 'inApp', checked)}
                        />
                      </div>
                    </div>

                    <div className="rounded-md border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">Billing & subscription</p>
                          <p className="text-sm text-muted-foreground">Renewals, failed payments, trial reminders (email)</p>
                        </div>
                        <Switch
                          checked={notificationSettings.billing.email}
                          onCheckedChange={(checked) => updateNotificationChannel('billing', 'email', checked)}
                        />
                      </div>
                    </div>
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
                  {user.role === 'admin' && stores.length > 0 && (
                    <div>
                      <Label htmlFor="store-select">Select Store</Label>
                      <select
                        id="store-select"
                        value={selectedStoreId}
                        onChange={(e) => setSelectedStoreId(e.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 p-2"
                      >
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-muted-foreground">Exports include data for the selected store across your organization.</p>
                    </div>
                  )}
                  {user.role === 'manager' && (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      Exports are limited to {stores.find((s) => s.id === selectedStoreId)?.name || 'your assigned store'}.
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

            {user?.role === 'admin' && (
              <TabsContent value="profile" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>Update your personal details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input id="firstName" value={profileForm.firstName} onChange={e => setProfileForm({ ...profileForm, firstName: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input id="lastName" value={profileForm.lastName} onChange={e => setProfileForm({ ...profileForm, lastName: e.target.value })} />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone</Label>
                        <Input id="phone" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="location">Location</Label>
                        <Input id="location" value={profileForm.location} onChange={e => setProfileForm({ ...profileForm, location: e.target.value })} />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="companyName">Company</Label>
                        <Input id="companyName" value={profileForm.companyName} onChange={e => setProfileForm({ ...profileForm, companyName: e.target.value })} />
                      </div>
                    </div>
                    {emailChanged && (
                      <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50/60 p-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800">
                          <span>Current email: <strong>{user.email}</strong></span>
                          <span>New email: <strong>{profileForm.email}</strong></span>
                        </div>
                        <div>
                          <Label htmlFor="password">Current Password (required to change email)</Label>
                          <Input
                            id="password"
                            type="password"
                            value={profileForm.password}
                            onChange={e => setProfileForm({ ...profileForm, password: e.target.value })}
                          />
                          <p className="mt-1 text-xs text-amber-700">
                            We require your password plus a verification code when changing the account email.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="profileOtpCode">Verification code</Label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              id="profileOtpCode"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="123456"
                              value={profileOtpCode}
                              onChange={(e) => setProfileOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                              disabled={otpVerified}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRequestProfileOtp}
                              disabled={isRequestingProfileOtp || !emailChanged}
                            >
                              {isRequestingProfileOtp ? 'Sending…' : sendProfileOtpLabel}
                            </Button>
                          </div>
                          <div className="text-xs text-gray-600">
                            {profileOtpStatus === 'sent' && !profileOtpExpired && (
                              <p>
                                Code sent to <strong>{profileOtpEmail}</strong>
                                {profileOtpCountdownLabel && ` · Expires in ${profileOtpCountdownLabel}`}
                              </p>
                            )}
                            {profileOtpExpired && (
                              <p className="font-medium text-red-600">Code expired. Request a new one.</p>
                            )}
                            {profileOtpStatus === 'verified' && (
                              <p className="font-medium text-green-600">Verification complete for this email.</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={handleVerifyProfileOtp}
                              disabled={otpVerified || isVerifyingProfileOtp || profileOtpExpired}
                            >
                              {otpVerified
                                ? 'Code verified'
                                : isVerifyingProfileOtp
                                  ? 'Verifying…'
                                  : 'Verify code'}
                            </Button>
                            {otpVerified && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">OTP verified</Badge>
                            )}
                            {(profileOtpStatus === 'sent' || otpVerified) && (
                              <Button type="button" variant="ghost" onClick={resetProfileOtpState}>
                                Reset verification
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Button onClick={handleSaveProfile} disabled={saveProfileDisabled}>
                        {isSavingProfile ? 'Saving...' : 'Save Profile'}
                      </Button>
                      {emailChanged && !otpVerified && (
                        <p className="text-sm text-amber-700">
                          Verify the new email address above to enable saving.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
