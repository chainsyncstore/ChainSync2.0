import { useState, useEffect } from 'react';
import { useAuth } from './use-auth';

export type WhitelistRole = 'ADMIN' | 'MANAGER' | 'CASHIER';

export interface IpWhitelist {
  id: string;
  ipAddress: string;
  description?: string;
  whitelistedBy: string;
  whitelistedFor: string;
  role: WhitelistRole;
  storeId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  scope?: 'user' | 'store';
}

export interface IpWhitelistLog {
  id: string;
  ipAddress: string;
  userId?: string;
  username?: string;
  action: string;
  success: boolean;
  reason?: string;
  userAgent?: string;
  createdAt: string;
}

export function useIpWhitelist() {
  const [whitelist, setWhitelist] = useState<IpWhitelist[]>([]);
  const [logs, setLogs] = useState<IpWhitelistLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchWhitelist = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ip-whitelist');
      if (response.ok) {
        const data = await response.json();
        setWhitelist(Array.isArray(data) ? data : []);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch IP whitelist');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addStoreIpToWhitelist = async (ipAddress: string, storeId: string, roles: WhitelistRole[], description?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ip-whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'store',
          ipAddress,
          storeId,
          roles,
          description,
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        const entries: IpWhitelist[] = payload?.entries ?? [];
        setWhitelist(prev => [...prev, ...entries]);
        return entries;
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to add IP to whitelist');
        throw new Error(errorData.message);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const removeIpFromWhitelist = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ip-whitelist/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setWhitelist(prev => prev.filter(item => item.id !== id));
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to remove IP from whitelist');
        throw new Error(errorData.message);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    if (user?.role !== 'admin') return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ip-whitelist/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch IP access logs');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchWhitelist();
      if (user.role === 'admin') {
        fetchLogs();
      }
    }
  }, [user]);

  return {
    whitelist,
    logs,
    loading,
    error,
    addStoreIpToWhitelist,
    removeIpFromWhitelist,
    fetchWhitelist,
    fetchLogs,
  };
}