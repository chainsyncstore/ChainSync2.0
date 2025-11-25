import type { NotificationService } from '../websocket/notification-service';

let singleton: NotificationService | null = null;

export function registerNotificationService(service: NotificationService) {
  singleton = service;
}

export function getNotificationService(): NotificationService | null {
  return singleton;
}
