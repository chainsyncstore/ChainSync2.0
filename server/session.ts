import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

export function createRedisClient(redisUrl: string) {
	const client = createClient({ url: redisUrl }) as any;
	client.on('error', (err: any) => console.error('Redis Client Error', err));
	return client;
}

export function configureSession(redisUrl: string | undefined, sessionSecret: string) {
	let store: any | undefined;
	if (redisUrl) {
		const client = createRedisClient(redisUrl);
		client.connect().catch((e: any) => console.error('Redis connect error', e));
		store = new (RedisStore as any)({ client, prefix: 'chainsync:sess:' });
	} else {
		console.warn('REDIS_URL not set; using in-memory session store (not recommended for production).');
	}

	return session({
		...(store ? { store } : {}),
		secret: sessionSecret,
		resave: false,
		saveUninitialized: false,
		name: 'chainsync.sid',
		cookie: {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 1000 * 60 * 60 * 8,
		},
	});
}


