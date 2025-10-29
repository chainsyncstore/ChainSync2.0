import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;

export function getRedisClient(): RedisClientType | null {
  if (client) return client;
  
  // Check if Redis is explicitly disabled for local development
  if (process.env.LOCAL_DISABLE_REDIS === 'true') {
    return null;
  }
  
  const url = process.env.REDIS_URL;
  if (!url) return null;
  client = createClient({ url }) as RedisClientType;
  client.on('error', (err) => {
    console.error('Redis Client Error', err);
  });
  // Fire and forget connect; callers should handle null client for safety
  client.connect().catch(() => {});
  return client;
}

function formatDateKey(date = new Date()): string {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface SaleDelta {
  revenue: number;
  transactions: number;
  discount?: number;
  tax?: number;
}

export async function incrementTodayRollups(orgId: string, storeId: string, delta: SaleDelta): Promise<void> {
  const c = getRedisClient();
  if (!c) return;
  const dateKey = formatDateKey();
  const orgKey = `chainsync:rollup:org:${orgId}:date:${dateKey}`;
  const storeKey = `chainsync:rollup:store:${storeId}:date:${dateKey}`;
  const pipeline = c.multi();
  pipeline.hIncrByFloat(orgKey, 'revenue', delta.revenue);
  pipeline.hIncrBy(orgKey, 'transactions', delta.transactions);
  if (delta.discount != null) pipeline.hIncrByFloat(orgKey, 'discount', delta.discount);
  if (delta.tax != null) pipeline.hIncrByFloat(orgKey, 'tax', delta.tax);
  pipeline.expire(orgKey, 60 * 60 * 48); // keep for 48h

  pipeline.hIncrByFloat(storeKey, 'revenue', delta.revenue);
  pipeline.hIncrBy(storeKey, 'transactions', delta.transactions);
  if (delta.discount != null) pipeline.hIncrByFloat(storeKey, 'discount', delta.discount);
  if (delta.tax != null) pipeline.hIncrByFloat(storeKey, 'tax', delta.tax);
  pipeline.expire(storeKey, 60 * 60 * 48);

  await pipeline.exec();
}

export async function getTodayRollupForOrg(orgId: string): Promise<{ revenue: number; transactions: number; discount: number; tax: number } | null> {
  const c = getRedisClient();
  if (!c) return null;
  const dateKey = formatDateKey();
  const key = `chainsync:rollup:org:${orgId}:date:${dateKey}`;
  const res = await c.hGetAll(key);
  if (!res || Object.keys(res).length === 0) return null;
  return {
    revenue: parseFloat(res.revenue || '0'),
    transactions: parseInt(res.transactions || '0', 10) || 0,
    discount: parseFloat(res.discount || '0'),
    tax: parseFloat(res.tax || '0'),
  };
}

export async function getTodayRollupForStore(storeId: string): Promise<{ revenue: number; transactions: number; discount: number; tax: number } | null> {
  const c = getRedisClient();
  if (!c) return null;
  const dateKey = formatDateKey();
  const key = `chainsync:rollup:store:${storeId}:date:${dateKey}`;
  const res = await c.hGetAll(key);
  if (!res || Object.keys(res).length === 0) return null;
  return {
    revenue: parseFloat(res.revenue || '0'),
    transactions: parseInt(res.transactions || '0', 10) || 0,
    discount: parseFloat(res.discount || '0'),
    tax: parseFloat(res.tax || '0'),
  };
}


