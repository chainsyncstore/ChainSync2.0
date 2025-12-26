import type { Express, Request, Response } from 'express';
import { logger } from '../lib/logger';
import { getClientIp } from '../middleware/authz';

/**
 * Geolocation endpoint using ipinfo.io to detect user's country
 * Returns 'nigeria' for Nigerian IPs, 'international' for all others
 */
export function registerGeolocationRoutes(app: Express) {
    app.get('/api/geolocation', async (req: Request, res: Response) => {
        try {
            const clientIp = getClientIp(req);

            // Skip geolocation for local/private IPs
            if (isPrivateIp(clientIp)) {
                logger.debug('Geolocation: Private IP detected, defaulting to international', { ip: clientIp });
                return res.json({ location: 'international', detected: false });
            }

            const ipinfoToken = process.env.IPINFO_TOKEN;

            if (!ipinfoToken) {
                logger.warn('IPINFO_TOKEN not configured, defaulting to international');
                return res.json({ location: 'international', detected: false });
            }

            // Call ipinfo.io API
            const response = await fetch(`https://ipinfo.io/${clientIp}?token=${ipinfoToken}`);

            if (!response.ok) {
                logger.warn('ipinfo.io request failed', { status: response.status, ip: clientIp });
                return res.json({ location: 'international', detected: false });
            }

            const data = await response.json() as { country?: string };
            const countryCode = data.country?.toUpperCase();

            // NG = Nigeria
            const location = countryCode === 'NG' ? 'nigeria' : 'international';

            logger.debug('Geolocation detected', { ip: clientIp, country: countryCode, location });

            return res.json({ location, detected: true, country: countryCode });
        } catch (error) {
            logger.error('Geolocation detection failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            return res.json({ location: 'international', detected: false });
        }
    });
}

/**
 * Check if IP is private/local (not routable on the internet)
 */
function isPrivateIp(ip: string): boolean {
    if (!ip || ip === '::1' || ip === 'localhost') return true;

    // IPv4 private ranges
    const privateRanges = [
        /^10\./,           // 10.0.0.0/8
        /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
        /^192\.168\./,     // 192.168.0.0/16
        /^127\./,          // 127.0.0.0/8 (localhost)
        /^0\./,            // 0.0.0.0/8
        /^169\.254\./,     // 169.254.0.0/16 (link-local)
    ];

    return privateRanges.some(range => range.test(ip));
}
