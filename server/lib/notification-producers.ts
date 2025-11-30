import { and, eq } from 'drizzle-orm';
import { users } from '@shared/schema';
import { db } from '../db';
import { sendEmail, generateUserActivityAlertEmail } from '../email';
import type { NotificationEvent } from '../websocket/notification-service';
import { logger } from './logger';
import { getNotificationService } from './notification-bus';
import { isUserActivityEmailEnabled } from './notification-preferences';

interface OrgAdminRecipient {
  id: string;
  email: string | null;
  settings: Record<string, any> | null;
  firstName?: string | null;
  lastName?: string | null;
}

type BroadcastBuilder = () => Omit<NotificationEvent, 'userId'>;

async function fetchOrgAdmins(orgId: string): Promise<OrgAdminRecipient[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      settings: users.settings,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(and(eq(users.orgId, orgId as any), eq(users.isAdmin as any, true as any)));
}

async function broadcastToOrgAdmins(orgId: string, builder: BroadcastBuilder): Promise<void> {
  const ws = getNotificationService();
  if (!ws) {
    logger.debug('Notification service not initialized. Skipping broadcast.', { orgId });
    return;
  }
  const admins = await fetchOrgAdmins(orgId);
  if (!admins.length) {
    logger.debug('No org admins to notify', { orgId });
    return;
  }
  await Promise.all(
    admins.map((admin) =>
      ws.broadcastNotification({
        ...builder(),
        userId: admin.id,
      })
    )
  );
}

export async function emitPaymentAlert(params: {
  orgId: string;
  title: string;
  message: string;
  priority?: NotificationEvent['priority'];
  data?: Record<string, any>;
}): Promise<void> {
  await broadcastToOrgAdmins(params.orgId, () => ({
    type: 'payment_alert',
    title: params.title,
    message: params.message,
    priority: params.priority ?? 'medium',
    data: params.data ?? {},
  }));
}

export async function emitUserActivityAlert(params: {
  orgId: string | null | undefined;
  storeId?: string | null;
  title: string;
  message: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  data?: Record<string, any>;
  sendEmail?: boolean;
}): Promise<void> {
  if (!params.orgId) {
    logger.debug('emitUserActivityAlert skipped due to missing orgId');
    return;
  }
  const severityToPriority: Record<string, NotificationEvent['priority']> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
  };
  const priority = severityToPriority[params.severity ?? 'medium'] ?? 'medium';
  await broadcastToOrgAdmins(params.orgId, () => ({
    type: 'user_activity',
    title: params.title,
    message: params.message,
    priority,
    storeId: params.storeId ?? undefined,
    data: params.data ?? {},
  }));

  if (params.sendEmail === false) {
    return;
  }

  const admins = await fetchOrgAdmins(params.orgId);
  const recipients = admins.filter((admin) =>
    isUserActivityEmailEnabled(admin.settings as Record<string, any> | undefined)
  );
  if (!recipients.length) return;

  const friendlyTitle = params.title || 'Security alert';
  await Promise.all(
    recipients
      .filter((admin) => admin.email)
      .map((admin) =>
        sendEmail(
          generateUserActivityAlertEmail({
            to: admin.email!,
            recipientName: admin.firstName || admin.lastName,
            title: friendlyTitle,
            message: params.message,
            severity: params.severity ?? 'medium',
            details: params.data ?? {},
          })
        ).catch((error) =>
          logger.warn('Failed to send user activity email', {
            orgId: params.orgId!,
            email: admin.email,
            error: error instanceof Error ? error.message : String(error),
          })
        )
      )
  );
}

export async function emitAiInsightAlert(params: {
  orgId: string;
  storeId?: string;
  title: string;
  message: string;
  priority?: NotificationEvent['priority'];
  data?: Record<string, any>;
}): Promise<void> {
  const ws = getNotificationService();
  const priority = params.priority ?? 'medium';
  if (ws && params.storeId) {
    await ws.broadcastNotification({
      type: 'ai_insight',
      storeId: params.storeId,
      title: params.title,
      message: params.message,
      priority,
      data: params.data ?? {},
    });
  }
  await broadcastToOrgAdmins(params.orgId, () => ({
    type: 'ai_insight',
    title: params.title,
    message: params.message,
    priority,
    storeId: params.storeId,
    data: params.data ?? {},
  }));
}
