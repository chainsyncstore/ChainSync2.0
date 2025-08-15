import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

export function createRedisClient(redisUrl: string) {
	const client = createClient({ url: redisUrl }) as any;
	client.on('error', (err: any) => console.error('Redis Client Error', err));
	return client;
}

export function configureSession(redisUrl: string, sessionSecret: string) {
	const client = createRedisClient(redisUrl);
	client.connect().catch((e: any) => console.error('Redis connect error', e));
	const store = new (RedisStore as any)({ client, prefix: 'chainsync:sess:' });

	return session({
		store,
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


