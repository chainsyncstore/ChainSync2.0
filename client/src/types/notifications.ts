export type NotificationScope =
  | { type: 'org' }
  | { type: 'store'; storeId: string | null; storeName: string | null };

export type NotificationChannels = {
  systemHealth: { email: boolean };
  storePerformance: { email: boolean; inApp: boolean };
  inventoryRisks: { inApp: boolean };
  billing: { email: boolean };
};

export const defaultNotificationSettings: NotificationChannels = {
  systemHealth: { email: false },
  storePerformance: { email: false, inApp: false },
  inventoryRisks: { inApp: false },
  billing: { email: false },
};

export function normalizeNotificationSettingsPayload(raw?: Partial<NotificationChannels> | Record<string, unknown>): NotificationChannels {
  const legacySalesReports = typeof (raw as any)?.salesReports === 'boolean' ? (raw as any)?.salesReports : undefined;
  const legacySystemUpdates = typeof (raw as any)?.systemUpdates === 'boolean' ? (raw as any)?.systemUpdates : undefined;
  const legacyLowStock = typeof (raw as any)?.lowStockAlerts === 'boolean' ? (raw as any)?.lowStockAlerts : undefined;

  return {
    systemHealth: {
      email: Boolean((raw as any)?.systemHealth?.email ?? legacySystemUpdates ?? defaultNotificationSettings.systemHealth.email),
    },
    storePerformance: {
      email: Boolean((raw as any)?.storePerformance?.email ?? legacySalesReports ?? defaultNotificationSettings.storePerformance.email),
      inApp: Boolean((raw as any)?.storePerformance?.inApp ?? defaultNotificationSettings.storePerformance.inApp),
    },
    inventoryRisks: {
      inApp: Boolean((raw as any)?.inventoryRisks?.inApp ?? legacyLowStock ?? defaultNotificationSettings.inventoryRisks.inApp),
    },
    billing: {
      email: Boolean((raw as any)?.billing?.email ?? defaultNotificationSettings.billing.email),
    },
  };
}
