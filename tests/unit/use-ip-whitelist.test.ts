import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIpWhitelist } from '../../client/src/hooks/use-ip-whitelist';

const csrfMocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn<() => Promise<string>>(),
  clearCsrfTokenCache: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  state: { user: { role: 'admin' as const } },
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authMocks.state,
}));

vi.mock('@/lib/csrf', () => ({
  getCsrfToken: csrfMocks.getCsrfToken,
  clearCsrfTokenCache: csrfMocks.clearCsrfTokenCache,
}));

describe('useIpWhitelist', () => {
  const originalFetch = global.fetch;
  const fetchMock = vi.fn();
  let responseQueue: Array<Response | Error> = [];

  beforeEach(() => {
    fetchMock.mockReset();
    responseQueue = [];
    fetchMock.mockImplementation(() => {
      const next = responseQueue.shift();
      if (!next) {
        return Promise.reject(new Error('Unexpected fetch call with empty response queue'));
      }
      if (next instanceof Error) {
        return Promise.reject(next);
      }
      return Promise.resolve(next);
    });
    csrfMocks.getCsrfToken.mockReset();
    csrfMocks.clearCsrfTokenCache.mockReset();
    csrfMocks.getCsrfToken.mockResolvedValue('csrf-token');

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const okResponse = <T,>(data: T, extra: Partial<Response> = {} as Partial<Response>) => ({
    ok: true,
    json: async () => data,
    ...extra,
  }) as Response;

  it('includes credentials and CSRF token when adding a store IP', async () => {
    const entry = { id: 'ip-1', ipAddress: '1.1.1.1', role: 'MANAGER', createdAt: new Date().toISOString() };

    responseQueue.push(
      okResponse([]), // initial whitelist fetch
      okResponse([]), // initial logs fetch
      okResponse({ entries: [entry] }) // POST response
    );

    const { result } = renderHook(() => useIpWhitelist());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      await result.current.addStoreIpToWhitelist('1.1.1.1', 'store-1', ['MANAGER'], 'Front desk');
    });

    expect(csrfMocks.getCsrfToken).toHaveBeenCalled();

    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(postCall).toBeDefined();

    const [, options] = postCall!;
    expect(options?.credentials).toBe('include');

    const headers = options?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    expect(headers!['X-CSRF-Token']).toBe('csrf-token');

    const parsedBody = JSON.parse((options!.body as string) ?? '{}');
    expect(parsedBody).toMatchObject({
      ipAddress: '1.1.1.1',
      storeId: 'store-1',
      roles: ['MANAGER'],
      description: 'Front desk',
    });
  });

  it('includes credentials and CSRF token when removing an IP', async () => {
    responseQueue.push(
      okResponse([]), // whitelist fetch
      okResponse([]), // logs fetch
      okResponse({}, { ok: true }) // delete response
    );

    const { result } = renderHook(() => useIpWhitelist());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      await result.current.removeIpFromWhitelist('ip-entry');
    });

    const deleteCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'DELETE');
    expect(deleteCall).toBeDefined();

    const [, options] = deleteCall!;
    expect(options?.credentials).toBe('include');

    const headers = options?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    expect(headers!['X-CSRF-Token']).toBe('csrf-token');
  });

  it('clears cached CSRF token when network request fails', async () => {
    responseQueue.push(
      okResponse([]), // whitelist fetch
      okResponse([]), // logs fetch
      new Error('network down')
    );

    const { result } = renderHook(() => useIpWhitelist());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await expect(
      act(async () => {
        await result.current.addStoreIpToWhitelist('2.2.2.2', 'store-2', ['CASHIER']);
      })
    ).rejects.toThrow();

    expect(csrfMocks.clearCsrfTokenCache).not.toHaveBeenCalled();
  });
});
