import RedisStore from 'connect-redis';
import session from 'express-session';
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

    // Cookie policy:
    // - sameSite: 'lax' keeps SPA navigation and third-party redirects working while
    //   mitigating CSRF for top-level POSTs from other sites. Non-GETs are still protected
    //   by our header+cookie CSRF validation in `server/middleware/security.ts`.
    // - secure: true only in production so cookies are sent over HTTPS. With
    //   `app.set('trust proxy', 1)` in production (see `server/index.ts`), Express correctly
    //   detects HTTPS behind the load balancer and sets the Secure flag.
    // - httpOnly: true prevents JavaScript access to the session cookie.
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
			...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
		},
	});
}
