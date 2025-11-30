import { logger } from './logger';
import type { SystemHealthTranslation } from './system-health-translator';

const RESOLUTION_STATE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const RESOLUTION_FOLLOW_UP_DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes

type FollowUpState = {
  lastActiveAt: number;
  pendingTimer?: ReturnType<typeof setTimeout>;
};

const followUpState = new Map<string, FollowUpState>();

interface HandleSystemHealthNotificationParams {
  issueId?: string | null;
  translation: SystemHealthTranslation;
  deliver: () => Promise<void>;
}

export async function handleSystemHealthNotification({
  issueId,
  translation,
  deliver,
}: HandleSystemHealthNotificationParams): Promise<void> {
  if (!issueId) {
    await deliver();
    return;
  }

  const now = Date.now();
  const state = followUpState.get(issueId);

  if (translation.status === 'active') {
    if (state?.pendingTimer) {
      clearTimeout(state.pendingTimer);
    }
    followUpState.set(issueId, { lastActiveAt: now });
    await deliver();
    return;
  }

  if (translation.status === 'resolved') {
    if (!state || now - state.lastActiveAt > RESOLUTION_STATE_TTL_MS) {
      followUpState.delete(issueId);
      logger.debug('Skipping resolved follow-up without prior active event', { issueId });
      return;
    }

    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
    }

    const timeout = setTimeout(() => {
      void deliver()
        .catch((error) => {
          logger.warn('System health follow-up delivery failed', {
            issueId,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          followUpState.delete(issueId);
        });
    }, RESOLUTION_FOLLOW_UP_DEBOUNCE_MS);

    followUpState.set(issueId, { lastActiveAt: state.lastActiveAt, pendingTimer: timeout });
    return;
  }

  await deliver();
}

export function resetSystemHealthFollowUps(): void {
  followUpState.forEach((state) => {
    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
    }
  });
  followUpState.clear();
}
