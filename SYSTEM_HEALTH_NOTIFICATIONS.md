# System Health & Maintenance Notifications

This document summarizes the new user-friendly system health notification channel now wired to the Sentry webhook pipeline. Share it with support, success, and ops teams when you roll out the feature.

## Overview
- **Audience**: Org admins and store managers who opted in to `System health & maintenance` emails.
- **Sources**: Sentry issue alerts and metric alerts delivered via `/webhooks/sentry`.
- **Outputs**: 
  - In-app real-time notifications (`type: "monitoring_alert"`) with plain-English titles and summaries.
  - Emails generated through `generateMonitoringAlertEmail`, showing the same friendly copy.
- **Status-page link**: `statusPageUrl` is included in the translation payload but left `null` until we publish an external page.

## Status buckets & messaging
| Bucket | When it triggers | Title template | Summary highlights | Action flag |
| --- | --- | --- | --- | --- |
| **Outage** | Fatal errors, outage keywords | `Service interruption – {area}` | Describes impact + reassures engineers are restoring service | No |
| **Degraded performance** | Metric alerts, latency keywords | `Performance slowdown – {area}` | Notes slower responses and that work continues | No |
| **Scheduled maintenance** | Deploy/maintenance keywords | `Maintenance in progress – {area}` | Explains limited availability during window | No |
| **Security advisory** | Security/auth keywords | `Security warning – {area}` | Prompts admins to verify access and stay alert | Yes |
| **General system issue** | Fallback | `System notice – {area}` | Generic heads-up when nothing matches | No |
| **Resolved follow-up** | Resolution signals | `… resolved – {area}` | Confirms recovery and closes the loop | Matches bucket |

Each bucket has matching resolution copy so users receive a follow-up when Sentry marks the issue resolved.

## Translator behavior
- File: `server/lib/system-health-translator.ts`.
- Normalizes Sentry payloads (resource, tags, action, fingerprint) and classifies into the buckets above.
- Outputs `SystemHealthTranslation` objects with friendly `title`, `message`, `priority`, `requiresAction`, and `statusPageUrl` (currently `null`).
- Unit tests live in `server/lib/__tests__/system-health-translator.test.ts`.

## Notification delivery
1. `/webhooks/sentry` verifies the signature, deduplicates events, and calls `translateSentryEvent`.
2. `handleSystemHealthNotification` (server/lib/system-health-follow-ups.ts) decides whether to deliver immediately (active) or after a 2-minute debounce (resolved follow-up). Debounce ensures we only send the resolution if the issue was active within the last 6 hours.
3. Delivery payloads are broadcast via `NotificationService` and emailed via `generateMonitoringAlertEmail` with the friendly copy.
4. Recipients are org admins plus managers whose `systemHealth.email` preference is enabled (`isSystemHealthEmailEnabled`).

## User preferences & UI
- Settings page (`/settings` → Notifications tab) now describes system-health alerts as plain-language uptime, maintenance, and security notices.
- Toggle label: "System health & maintenance" (email). Enabling the switch opts the user into both in-app and email system-health notifications.
- Desktop notifications are shown through `useNotificationBridge` only when `systemHealth.email` is enabled and the user is an admin or manager.

## Testing & QA checklist
- `npm run lint` and `npm run test:unit` cover translator classification, preferences, and follow-up scheduling.
- Manual sanity checks:
  1. Send a mock Sentry webhook with an outage payload → expect friendly WS + email.
  2. Send a resolved payload with the same issue ID within 2 minutes → expect a single follow-up notification after the debounce window.
  3. Disable `systemHealth` in `/settings` → no WS/email for monitoring alerts.

## Future enhancements
- When the public status page launches, populate `statusPageUrl` so the app and email templates can link out without code changes.
- Consider persisting follow-up state across process restarts if we add multi-instance workers.
