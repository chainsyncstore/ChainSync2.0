import { describe, it, expect } from 'vitest';
import { translateSentryEvent } from '../system-health-translator';

function buildPayload(overrides: Record<string, any> = {}) {
  return {
    resource: 'error',
    data: {
      event: {
        title: 'Checkout failures',
        message: 'Storefront API returned 500 errors',
        level: 'error',
        tags: [
          ['transaction', 'checkout'],
          ['status', 'open'],
        ],
      },
    },
    ...overrides,
  };
}

describe('translateSentryEvent', () => {
  it('classifies outages as high priority active events', () => {
    const translated = translateSentryEvent(buildPayload());
    expect(translated.status).toBe('active');
    expect(translated.category).toBe('outage');
    expect(translated.priority).toBe('high');
    expect(translated.title).toContain('Service interruption');
    expect(translated.affectedArea).toBe('checkout');
  });

  it('detects resolved events via action tag', () => {
    const payload = buildPayload({ action: 'resolved' });
    const translated = translateSentryEvent(payload);
    expect(translated.status).toBe('resolved');
    expect(translated.priority).toBe('low');
    expect(translated.title).toContain('Service restored');
  });

  it('maps security keywords to security category', () => {
    const payload = buildPayload({
      data: {
        event: {
          title: 'Suspicious login spike',
          message: 'security anomaly detected',
          level: 'warning',
          tags: [
            ['status', 'open'],
            ['user', 'admin@chainsync.com'],
          ],
        },
      },
    });
    const translated = translateSentryEvent(payload);
    expect(translated.category).toBe('security');
    expect(translated.priority).toBe('high');
    expect(translated.requiresAction).toBe(true);
    expect(translated.affectedArea).toBe('admin@chainsync.com');
  });

  it('falls back to general category with sanitized area', () => {
    const payload = buildPayload({
      data: {
        event: {
          title: 'Minor notice',
          message: 'Heads up',
          level: 'info',
          tags: [],
        },
      },
    });
    const translated = translateSentryEvent(payload);
    expect(translated.category).toBe('general');
    expect(translated.affectedArea).toBe('Minor notice');
  });
});

describe.skip('system health follow-ups', () => {
  it('delays resolved notifications by debounce window when follow-up state exists', () => {
    // TODO: add tests once follow-up helper is wired into translator flow
  });
});
