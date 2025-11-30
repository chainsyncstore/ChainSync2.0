import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleSystemHealthNotification,
  resetSystemHealthFollowUps,
  RESOLUTION_FOLLOW_UP_DEBOUNCE_MS,
} from '../system-health-follow-ups';
import type { SystemHealthTranslation } from '../system-health-translator';

function buildTranslation(status: 'active' | 'resolved'): SystemHealthTranslation {
  return {
    status,
    category: 'outage',
    priority: status === 'active' ? 'high' : 'low',
    title: status === 'active' ? 'Service interruption – checkout' : 'Service restored – checkout',
    message: status === 'active' ? 'We detected an outage' : 'Issue resolved',
    requiresAction: status === 'active',
    affectedArea: 'checkout',
    tags: {},
  };
}

function createDeliverySpy() {
  const fn = vi.fn<() => Promise<void>>(async () => {});
  fn.mockResolvedValue(undefined);
  return fn;
}

describe('system health follow-up handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSystemHealthFollowUps();
  });

  afterEach(() => {
    vi.runAllTimers();
    resetSystemHealthFollowUps();
    vi.useRealTimers();
  });

  it('delivers active events immediately and tracks state', async () => {
    const deliver = createDeliverySpy();
    await handleSystemHealthNotification({ issueId: 'ISSUE-1', translation: buildTranslation('active'), deliver });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('debounces resolved follow-ups that have recent active activity', async () => {
    const deliver = createDeliverySpy();
    await handleSystemHealthNotification({ issueId: 'ISSUE-2', translation: buildTranslation('active'), deliver });
    await handleSystemHealthNotification({ issueId: 'ISSUE-2', translation: buildTranslation('resolved'), deliver });

    expect(deliver).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RESOLUTION_FOLLOW_UP_DEBOUNCE_MS - 50);
    expect(deliver).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it('skips resolved notifications when no prior active state exists', async () => {
    const deliver = createDeliverySpy();
    await handleSystemHealthNotification({ issueId: 'ISSUE-3', translation: buildTranslation('resolved'), deliver });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('cancels pending follow-up when a new active alert arrives before debounce completes', async () => {
    const deliver = createDeliverySpy();
    await handleSystemHealthNotification({ issueId: 'ISSUE-4', translation: buildTranslation('active'), deliver });
    await handleSystemHealthNotification({ issueId: 'ISSUE-4', translation: buildTranslation('resolved'), deliver });

    expect(deliver).toHaveBeenCalledTimes(1);

    await handleSystemHealthNotification({ issueId: 'ISSUE-4', translation: buildTranslation('active'), deliver });
    expect(deliver).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(RESOLUTION_FOLLOW_UP_DEBOUNCE_MS + 10);
    expect(deliver).toHaveBeenCalledTimes(2);
  });
});
