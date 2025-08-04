import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Settings, Store as StoreIcon, Users, Bell, Shield, Database } from "lucide-react";
import { formatPhoneNumber } from "@/lib/pos-utils";
import type { Store, LowStockAlert } from "@shared/schema";

export default function SettingsPage() {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState<string>("");

  const userData = {
    role: "manager",
    name: "John Doe",
    initials: "JD",
  };

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  // Auto-select first store when stores are loaded
  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
  });

  // Settings state
  const [storeSettings, setStoreSettings] = useState({
    name: "Main Street Store",
    address: "123 Main Street, City, State 12345",
    phone: "(555) 123-4567",
    email: "mainstreet@chainsync.com",
    taxRate: "8.5",
    timezone: "America/New_York",
    currency: "USD",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    lowStockAlerts: true,
    dailyReports: true,
    weeklyReports: false,
    errorNotifications: true,
    emailNotifications: true,
    smsNotifications: false,
  });

  const [posSettings, setPosSettings] = useState({
    autoCompleteBarcode: true,
    requireCustomerInfo: false,
    printReceipts: true,
    askForEmail: false,
    roundCash: true,
    allowPartialPayments: false,
  });

  const [securitySettings, setSecuritySettings] = useState({
    requirePasswordChange: false,
    sessionTimeout: "60",
    maxLoginAttempts: "3",
    enableTwoFactor: false,
    logUserActivity: true,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleSaveStoreSettings = () => {
    console.log("Saving store settings:", storeSettings);
    // In real app, make API call to save settings
  };

  const handleSaveNotificationSettings = () => {
    console.log("Saving notification settings:", notificationSettings);
    // In real app, make API call to save settings
  };

  const handleSavePOSSettings = () => {
    console.log("Saving POS settings:", posSettings);
    // In real app, make API call to save settings
  };

  const handleSaveSecuritySettings = () => {
    console.log("Saving security settings:", securitySettings);
    // In real app, make API call to save settings
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar
        title="Settings"
        subtitle="Configure store settings, notifications, and system preferences"
        currentDateTime={currentDateTime}
        onLogout={() => {}}
        userRole={userData.role}
        userName={userData.name}
        userInitials={userData.initials}
        selectedStore={selectedStore}
        stores={stores}
        onStoreChange={setSelectedStore}
        alertCount={alerts.length}
      />
      
      <main className="p-4 md:p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <Tabs defaultValue="store" className="space-y-6">
              <TabsList>
                <TabsTrigger value="store" className="flex items-center space-x-2">
                  <StoreIcon className="w-4 h-4" />
                  <span>Store</span>
                </TabsTrigger>
                <TabsTrigger value="pos" className="flex items-center space-x-2">
                  <Settings className="w-4 h-4" />
                  <span>POS</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="flex items-center space-x-2">
                  <Bell className="w-4 h-4" />
                  <span>Notifications</span>
                </TabsTrigger>
                <TabsTrigger value="users" className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Users</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center space-x-2">
                  <Shield className="w-4 h-4" />
                  <span>Security</span>
                </TabsTrigger>
                <TabsTrigger value="backup" className="flex items-center space-x-2">
                  <Database className="w-4 h-4" />
                  <span>Backup</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="store">
                <Card>
                  <CardHeader>
                    <CardTitle>Store Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="store-name">Store Name</Label>
                        <Input
                          id="store-name"
                          value={storeSettings.name}
                          onChange={(e) => setStoreSettings({...storeSettings, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="store-phone">Phone Number</Label>
                        <Input
                          id="store-phone"
                          value={storeSettings.phone}
                          onChange={(e) => setStoreSettings({...storeSettings, phone: formatPhoneNumber(e.target.value)})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="store-address">Address</Label>
                      <Textarea
                        id="store-address"
                        value={storeSettings.address}
                        onChange={(e) => setStoreSettings({...storeSettings, address: e.target.value})}
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="store-email">Email</Label>
                        <Input
                          id="store-email"
                          type="email"
                          value={storeSettings.email}
                          onChange={(e) => setStoreSettings({...storeSettings, email: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tax-rate">Tax Rate (%)</Label>
                        <Input
                          id="tax-rate"
                          type="number"
                          step="0.1"
                          value={storeSettings.taxRate}
                          onChange={(e) => setStoreSettings({...storeSettings, taxRate: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="timezone">Timezone</Label>
                        <Select value={storeSettings.timezone} onValueChange={(value) => setStoreSettings({...storeSettings, timezone: value})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern Time</SelectItem>
                            <SelectItem value="America/Chicago">Central Time</SelectItem>
                            <SelectItem value="America/Denver">Mountain Time</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currency">Currency</Label>
                        <Select value={storeSettings.currency} onValueChange={(value) => setStoreSettings({...storeSettings, currency: value})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD - US Dollar</SelectItem>
                            <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                            <SelectItem value="GBP">GBP - British Pound</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button onClick={handleSaveStoreSettings}>Save Store Settings</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pos">
                <Card>
                  <CardHeader>
                    <CardTitle>POS System Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Auto-complete barcode scanning</Label>
                          <p className="text-sm text-gray-500">Automatically add items when barcode is scanned</p>
                        </div>
                        <Switch
                          checked={posSettings.autoCompleteBarcode}
                          onCheckedChange={(checked) => setPosSettings({...posSettings, autoCompleteBarcode: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Print receipts automatically</Label>
                          <p className="text-sm text-gray-500">Print receipt after each completed transaction</p>
                        </div>
                        <Switch
                          checked={posSettings.printReceipts}
                          onCheckedChange={(checked) => setPosSettings({...posSettings, printReceipts: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Round cash payments</Label>
                          <p className="text-sm text-gray-500">Round cash totals to nearest nickel</p>
                        </div>
                        <Switch
                          checked={posSettings.roundCash}
                          onCheckedChange={(checked) => setPosSettings({...posSettings, roundCash: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Require customer information</Label>
                          <p className="text-sm text-gray-500">Require customer details for all transactions</p>
                        </div>
                        <Switch
                          checked={posSettings.requireCustomerInfo}
                          onCheckedChange={(checked) => setPosSettings({...posSettings, requireCustomerInfo: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Ask for email receipts</Label>
                          <p className="text-sm text-gray-500">Prompt customers for email receipt option</p>
                        </div>
                        <Switch
                          checked={posSettings.askForEmail}
                          onCheckedChange={(checked) => setPosSettings({...posSettings, askForEmail: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Allow partial payments</Label>
                          <p className="text-sm text-gray-500">Enable split payments across multiple methods</p>
                        </div>
                        <Switch
                          checked={posSettings.allowPartialPayments}
                          onCheckedChange={(checked) => setPosSettings({...posSettings, allowPartialPayments: checked})}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button onClick={handleSavePOSSettings}>Save POS Settings</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notifications">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Preferences</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Low stock alerts</Label>
                          <p className="text-sm text-gray-500">Get notified when inventory levels are low</p>
                        </div>
                        <Switch
                          checked={notificationSettings.lowStockAlerts}
                          onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, lowStockAlerts: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Daily reports</Label>
                          <p className="text-sm text-gray-500">Receive daily sales and performance reports</p>
                        </div>
                        <Switch
                          checked={notificationSettings.dailyReports}
                          onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, dailyReports: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Weekly reports</Label>
                          <p className="text-sm text-gray-500">Receive weekly analytics summaries</p>
                        </div>
                        <Switch
                          checked={notificationSettings.weeklyReports}
                          onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, weeklyReports: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Error notifications</Label>
                          <p className="text-sm text-gray-500">Get alerted about system errors and issues</p>
                        </div>
                        <Switch
                          checked={notificationSettings.errorNotifications}
                          onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, errorNotifications: checked})}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium">Delivery Methods</h4>
                      
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Email notifications</Label>
                          <p className="text-sm text-gray-500">Receive notifications via email</p>
                        </div>
                        <Switch
                          checked={notificationSettings.emailNotifications}
                          onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, emailNotifications: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>SMS notifications</Label>
                          <p className="text-sm text-gray-500">Receive critical alerts via SMS</p>
                        </div>
                        <Switch
                          checked={notificationSettings.smsNotifications}
                          onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, smsNotifications: checked})}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button onClick={handleSaveNotificationSettings}>Save Notification Settings</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users">
                <Card>
                  <CardHeader>
                    <CardTitle>User Management</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-600">Manage user accounts and permissions for this store.</p>
                        <Button>Add User</Button>
                      </div>
                      
                      <div className="border rounded-lg p-4">
                        <p className="text-center text-gray-500">User management interface would be implemented here</p>
                        <p className="text-center text-sm text-gray-400 mt-2">
                          Features: Add/remove users, role assignments, permission management
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="security">
                <Card>
                  <CardHeader>
                    <CardTitle>Security Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Require regular password changes</Label>
                          <p className="text-sm text-gray-500">Force users to update passwords every 90 days</p>
                        </div>
                        <Switch
                          checked={securitySettings.requirePasswordChange}
                          onCheckedChange={(checked) => setSecuritySettings({...securitySettings, requirePasswordChange: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Enable two-factor authentication</Label>
                          <p className="text-sm text-gray-500">Require 2FA for admin and manager accounts</p>
                        </div>
                        <Switch
                          checked={securitySettings.enableTwoFactor}
                          onCheckedChange={(checked) => setSecuritySettings({...securitySettings, enableTwoFactor: checked})}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Log user activity</Label>
                          <p className="text-sm text-gray-500">Track user actions for audit purposes</p>
                        </div>
                        <Switch
                          checked={securitySettings.logUserActivity}
                          onCheckedChange={(checked) => setSecuritySettings({...securitySettings, logUserActivity: checked})}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                        <Select value={securitySettings.sessionTimeout} onValueChange={(value) => setSecuritySettings({...securitySettings, sessionTimeout: value})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 minutes</SelectItem>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="60">1 hour</SelectItem>
                            <SelectItem value="120">2 hours</SelectItem>
                            <SelectItem value="480">8 hours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max-login-attempts">Max Login Attempts</Label>
                        <Select value={securitySettings.maxLoginAttempts} onValueChange={(value) => setSecuritySettings({...securitySettings, maxLoginAttempts: value})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 attempts</SelectItem>
                            <SelectItem value="5">5 attempts</SelectItem>
                            <SelectItem value="10">10 attempts</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button onClick={handleSaveSecuritySettings}>Save Security Settings</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="backup">
                <Card>
                  <CardHeader>
                    <CardTitle>Data Backup & Recovery</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Automatic Backups</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          Your data is automatically backed up to secure cloud storage every 24 hours.
                        </p>
                        <div className="flex space-x-4">
                          <Button variant="outline">View Backup History</Button>
                          <Button variant="outline">Download Latest Backup</Button>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-2">Manual Backup</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          Create an immediate backup of your current data.
                        </p>
                        <Button>Create Backup Now</Button>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-2">Data Restoration</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          Restore your data from a previous backup. This action cannot be undone.
                        </p>
                        <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                          Restore from Backup
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
    </div>
  );
}
