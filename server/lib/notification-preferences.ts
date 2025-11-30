export type NormalizedNotificationSettings = {
  systemHealth: { email: boolean };
  storePerformance: { email: boolean; inApp: boolean };
  inventoryRisks: { inApp: boolean };
  billing: { email: boolean };
  paymentAlerts: { inApp: boolean };
  aiInsights: { inApp: boolean };
  lowStockAlerts: boolean;
  salesReports: boolean;
  systemUpdates: boolean;
};

export const defaultNotificationPreferences: NormalizedNotificationSettings = {
  systemHealth: { email: true },
  storePerformance: { email: true, inApp: true },
  inventoryRisks: { inApp: true },
  billing: { email: true },
  paymentAlerts: { inApp: true },
  aiInsights: { inApp: true },
  lowStockAlerts: true,
  salesReports: true,
  systemUpdates: true,
};

const coerceBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export const normalizeNotificationPreferences = (
  raw?: Record<string, any>
): NormalizedNotificationSettings => {
  const legacyLowStock = typeof raw?.lowStockAlerts === 'boolean' ? raw.lowStockAlerts : undefined;
  const legacySalesReports = typeof raw?.salesReports === 'boolean' ? raw.salesReports : undefined;
  const legacySystemUpdates = typeof raw?.systemUpdates === 'boolean' ? raw.systemUpdates : undefined;

  return {
    systemHealth: {
      email: coerceBoolean(raw?.systemHealth?.email, legacySystemUpdates ?? defaultNotificationPreferences.systemHealth.email),
    },
    storePerformance: {
      email: coerceBoolean(raw?.storePerformance?.email, legacySalesReports ?? defaultNotificationPreferences.storePerformance.email),
      inApp: coerceBoolean(raw?.storePerformance?.inApp, defaultNotificationPreferences.storePerformance.inApp),
    },
    inventoryRisks: {
      inApp: coerceBoolean(raw?.inventoryRisks?.inApp, legacyLowStock ?? defaultNotificationPreferences.inventoryRisks.inApp),
    },
    billing: {
      email: coerceBoolean(raw?.billing?.email, defaultNotificationPreferences.billing.email),
    },
    paymentAlerts: {
      inApp: coerceBoolean(raw?.paymentAlerts?.inApp, defaultNotificationPreferences.paymentAlerts.inApp),
    },
    aiInsights: {
      inApp: coerceBoolean(raw?.aiInsights?.inApp, defaultNotificationPreferences.aiInsights.inApp),
    },
    lowStockAlerts: coerceBoolean(raw?.lowStockAlerts, coerceBoolean(raw?.inventoryRisks?.inApp, defaultNotificationPreferences.lowStockAlerts)),
    salesReports: coerceBoolean(raw?.salesReports, coerceBoolean(raw?.storePerformance?.email, defaultNotificationPreferences.salesReports)),
    systemUpdates: coerceBoolean(raw?.systemUpdates, coerceBoolean(raw?.systemHealth?.email, defaultNotificationPreferences.systemUpdates)),
  };
};

export function getNormalizedNotificationsFromSettings(settings?: Record<string, any>): NormalizedNotificationSettings {
  const rawNotifications = (settings?.notifications ?? settings) as Record<string, any> | undefined;
  return normalizeNotificationPreferences(rawNotifications);
}

export type NotificationEmailChannel = 'systemHealth' | 'storePerformance' | 'billing' | 'userActivity';

export function isEmailChannelEnabled(
  settings: Record<string, any> | undefined,
  channel: NotificationEmailChannel
): boolean {
  const preferences = getNormalizedNotificationsFromSettings(settings);
  switch (channel) {
    case 'systemHealth':
      return Boolean(preferences.systemHealth.email);
    case 'storePerformance':
      return Boolean(preferences.storePerformance.email);
    case 'billing':
      return Boolean(preferences.billing.email);
    case 'userActivity':
      return Boolean(preferences.systemUpdates);
    default:
      return false;
  }
}

export function isSystemHealthEmailEnabled(settings?: Record<string, any>): boolean {
  return isEmailChannelEnabled(settings, 'systemHealth');
}

export function isUserActivityEmailEnabled(settings?: Record<string, any>): boolean {
  return isEmailChannelEnabled(settings, 'userActivity');
}

export const mergeNotificationPreferences = (
  current: NormalizedNotificationSettings,
  patch?: Record<string, any>
): NormalizedNotificationSettings => {
  if (!patch) {
    return current;
  }

  return {
    systemHealth: {
      email: coerceBoolean(patch.systemHealth?.email, current.systemHealth.email),
    },
    storePerformance: {
      email: coerceBoolean(patch.storePerformance?.email, current.storePerformance.email),
      inApp: coerceBoolean(patch.storePerformance?.inApp, current.storePerformance.inApp),
    },
    inventoryRisks: {
      inApp: coerceBoolean(patch.inventoryRisks?.inApp, current.inventoryRisks.inApp),
    },
    billing: {
      email: coerceBoolean(patch.billing?.email, current.billing.email),
    },
    paymentAlerts: {
      inApp: coerceBoolean(patch.paymentAlerts?.inApp, current.paymentAlerts.inApp),
    },
    aiInsights: {
      inApp: coerceBoolean(patch.aiInsights?.inApp, current.aiInsights.inApp),
    },
    lowStockAlerts: coerceBoolean(patch.lowStockAlerts, coerceBoolean(patch.inventoryRisks?.inApp, current.inventoryRisks.inApp)),
    salesReports: coerceBoolean(patch.salesReports, coerceBoolean(patch.storePerformance?.email, current.storePerformance.email)),
    systemUpdates: coerceBoolean(patch.systemUpdates, coerceBoolean(patch.systemHealth?.email, current.systemHealth.email)),
  };
};
