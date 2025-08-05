# IP Whitelist System for ChainSync

## Overview

The IP whitelist system provides an additional layer of security by restricting access to the ChainSync POS system based on IP addresses. This ensures that only authorized devices from specific locations can access the system.

## How It Works

### Role-Based IP Management

1. **Admins** can whitelist IP addresses for any user in the system
2. **Managers** can whitelist IP addresses for cashiers in their stores
3. **Cashiers** cannot manage IP whitelists (read-only access to their own whitelist)

### IP Whitelist Levels

1. **User-Specific Whitelist**: IP addresses whitelisted for a specific user
2. **Store-Level Whitelist**: IP addresses whitelisted for all users of a specific role within a store
3. **System-Level Whitelist**: IP addresses whitelisted for all users (admin only)

## Database Schema

### ip_whitelists Table
- `id`: Unique identifier
- `ip_address`: The whitelisted IP address (supports IPv4 and IPv6)
- `description`: Optional description of the IP address
- `whitelisted_by`: User ID who added this IP to the whitelist
- `whitelisted_for`: User ID this IP is whitelisted for
- `role`: Role this IP is whitelisted for (admin, manager, cashier)
- `store_id`: Store this IP is associated with (for managers/cashiers)
- `is_active`: Whether this whitelist entry is active
- `created_at`: When this entry was created
- `updated_at`: When this entry was last updated

### ip_whitelist_logs Table
- `id`: Unique identifier
- `ip_address`: IP address that attempted access
- `user_id`: User ID (if known)
- `username`: Username (if known)
- `action`: Action performed (login_attempt, whitelist_added, whitelist_removed)
- `success`: Whether the action was successful
- `reason`: Reason for success/failure
- `user_agent`: Browser/device information
- `created_at`: When this log entry was created

## API Endpoints

### GET /api/ip-whitelist
- **Purpose**: Get IP whitelist entries
- **Access**: All authenticated users
- **Response**: List of whitelist entries based on user role

### POST /api/ip-whitelist
- **Purpose**: Add IP to whitelist
- **Access**: Admins and managers only
- **Body**: `{ ipAddress, userId, description }`

### DELETE /api/ip-whitelist/:ipAddress/:userId
- **Purpose**: Remove IP from whitelist
- **Access**: Admins and managers only

### GET /api/ip-whitelist/logs
- **Purpose**: Get IP access logs
- **Access**: Admins only
- **Response**: List of recent IP access attempts

## Authentication Flow

1. User attempts to log in with username/password
2. System validates credentials
3. If credentials are valid, system checks if the user's IP is whitelisted
4. If IP is whitelisted, login proceeds
5. If IP is not whitelisted, login is denied
6. All attempts are logged for audit purposes

## Frontend Components

### IpWhitelistManager Component
- Located at: `client/src/components/ip-whitelist/ip-whitelist-manager.tsx`
- Features:
  - Add/remove IP addresses
  - View whitelist entries
  - Role-based access control
  - IP access logs (admin only)

### useIpWhitelist Hook
- Located at: `client/src/hooks/use-ip-whitelist.ts`
- Provides:
  - Fetch whitelist data
  - Add/remove IP addresses
  - Fetch access logs
  - Error handling

## Settings Page Integration

The IP whitelist manager is integrated into the settings page:
- **Admins**: Can access IP whitelist tab
- **Managers**: Can access IP whitelist tab
- **Cashiers**: Cannot access IP whitelist tab (read-only message shown)

## Testing

### Test Data
The system includes test IP whitelist entries:
- `127.0.0.1` - Admin local development
- `192.168.1.100` - Manager office computer
- `192.168.1.101` - Cashier POS terminal 1
- `192.168.1.102` - Cashier POS terminal 2

### Test Accounts
- **Admin**: `admin` / `admin123`
- **Manager**: `manager` / `manager123`
- **Cashier**: `cashier` / `cashier123`

## Security Considerations

1. **IP Spoofing**: The system relies on the IP address provided by the request. In production, ensure proper proxy configuration.
2. **Dynamic IPs**: Consider the impact of dynamic IP addresses on user access.
3. **VPN Access**: Users behind VPNs may have different IP addresses.
4. **Mobile Access**: Mobile devices may have changing IP addresses.

## Future Enhancements

1. **IP Range Support**: Allow whitelisting IP ranges (CIDR notation)
2. **Geolocation**: Restrict access based on geographic location
3. **Time-based Access**: Allow access only during specific hours
4. **Device Fingerprinting**: Additional device-based security
5. **Bulk Operations**: Add/remove multiple IP addresses at once

## Troubleshooting

### Common Issues

1. **Login Denied**: Check if the user's IP is whitelisted
2. **Permission Denied**: Verify user role has permission to manage whitelists
3. **IP Not Found**: Ensure the IP address is correctly formatted

### Debug Steps

1. Check IP access logs for failed attempts
2. Verify user role and permissions
3. Confirm IP address format and whitelist entries
4. Check database connectivity and schema

## Migration

To add IP whitelist to an existing ChainSync installation:

1. Run the database migration: `npm run db:push`
2. Seed test data: `npx tsx scripts/seed-ip-whitelist.ts`
3. Configure IP addresses for existing users
4. Test authentication with whitelisted IPs 