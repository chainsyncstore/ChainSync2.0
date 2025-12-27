import { readFileSync } from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

// Email configuration - in production, use environment variables
const resolvedPort = parseInt(process.env.SMTP_PORT || '587', 10);
const resolvedSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : resolvedPort === 465;

const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: resolvedPort,
  secure: resolvedSecure, // true for 465, false for other ports unless overridden
  auth: {
    user: process.env.SMTP_USER || 'your-brevo-username',
    pass: process.env.SMTP_PASS || 'your-brevo-smtp-key',
  },
};

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

// Logo loading utilities
const brandingDir = path.join(process.cwd(), 'assets', 'branding');

type LogoAsset = {
  buffer: Buffer;
  mimeType: string;
  dataUri: string;
};

const getMimeTypeForAsset = (fileName: string, defaultMime: string): string => {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.svg') {
    return 'image/svg+xml';
  }
  return defaultMime;
};

const loadLogoAsset = (fileName: string, defaultMime: string, fallback: string): LogoAsset => {
  try {
    const fileBuffer = readFileSync(path.join(brandingDir, fileName));
    const mimeType = getMimeTypeForAsset(fileName, defaultMime);
    return {
      buffer: fileBuffer,
      mimeType,
      dataUri: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
    };
  } catch (error) {
    console.warn(`ChainSync logo asset missing (${fileName}). Using fallback.`, error);
    const fallbackBuffer = Buffer.from(fallback, 'utf-8');
    const mimeType = 'image/svg+xml';
    return {
      buffer: fallbackBuffer,
      mimeType,
      dataUri: `data:${mimeType};base64,${fallbackBuffer.toString('base64')}`,
    };
  }
};

export interface UserActivityAlertEmailParams {
  to: string;
  recipientName?: string | null;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, any>;
}

const userActivitySeverityCopy: Record<UserActivityAlertEmailParams['severity'], { badge: string; description: string }> = {
  critical: {
    badge: 'Critical security event',
    description: 'Immediate attention required. Review the event details below and take action to secure your workspace.',
  },
  high: {
    badge: 'High risk activity detected',
    description: 'We detected unusual account activity. Please audit the user and resource referenced below.',
  },
  medium: {
    badge: 'Security advisory',
    description: 'We recommend reviewing this event to confirm the activity is expected.',
  },
  low: {
    badge: 'Security notice',
    description: 'This activity was logged for your records.',
  },
};

export function generateUserActivityAlertEmail(params: UserActivityAlertEmailParams): EmailOptions {
  const { to, recipientName, title, message, severity, details } = params;
  const friendlyName = recipientName?.trim()?.length ? recipientName.trim() : 'there';
  const severityCopy = userActivitySeverityCopy[severity];
  const detailEntries = details
    ? Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== '')
    : [];

  const htmlDetails = detailEntries.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 16px;">
        ${detailEntries
          .map(
            ([key, value]) => `
              <tr>
                <td style="padding:8px 10px; width:35%; background:#F8FAFC; border:1px solid #E2E8F0; font-size:13px; color:#475569; text-transform:capitalize;">${key.replace(/_/g, ' ')}</td>
                <td style="padding:8px 10px; border:1px solid #E2E8F0; font-size:13px; color:#0F172A;">${String(value)}</td>
              </tr>`
          )
          .join('')}
      </table>`
    : '';

  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', Arial, sans-serif; background-color: #F8FAFC; padding: 0; margin: 0;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 15px 35px rgba(15, 23, 42, 0.08); overflow: hidden;">
            <tr>
              <td style="padding: 28px 32px; background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%); color: white;">
                <img src="${LOGO_OUTLINE}" alt="ChainSync" width="64" height="64" style="display:block; margin-bottom: 12px;" />
                <p style="margin: 0 0 8px; letter-spacing: 0.08em; font-size: 11px; text-transform: uppercase; opacity: 0.8;">Security alert</p>
                <h1 style="margin: 0; font-size: 21px; font-weight: 600;">${title}</h1>
                <span style="display:inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.2);">${severityCopy.badge}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px; color: #0F172A;">
                <p style="margin: 0 0 12px; color: #475569;">Hi ${friendlyName},</p>
                <p style="margin: 0 0 16px; color: #475569; line-height: 1.6;">${severityCopy.description}</p>
                <div style="margin: 12px 0; padding: 16px; border-radius: 12px; background:#F1F5F9; color:#0F172A;">
                  ${message}
                </div>
                ${htmlDetails}
                <p style="margin-top: 18px; font-size: 12px; color: #94A3B8;">This notification was sent automatically because security alerts are enabled for your account.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const textLines = [
    `Security alert (${severity})`,
    title,
    message,
    ...detailEntries.map(([key, value]) => `${key}: ${value}`),
  ];

  return {
    to,
    subject: `[Security] ${title}`,
    html,
    text: textLines.join('\n'),
  };
}

export interface BillingAlertEmailParams {
  to: string;
  orgName: string;
  amount: number;
  currency?: string;
  reason: 'failed' | 'missing_method';
  dueDate?: Date;
  provider?: string;
  reference?: string;
  message?: string;
}

const billingReasonCopy: Record<BillingAlertEmailParams['reason'], { title: string; body: string }> = {
  failed: {
    title: 'Automatic renewal failed',
    body: 'We were unable to charge the saved payment method. Please update the card on file to keep your organization active.',
  },
  missing_method: {
    title: 'Payment method required',
    body: 'No payment method is on file for the upcoming renewal. Add a card to avoid losing access.',
  },
};

export function generateBillingAlertEmail(params: BillingAlertEmailParams): EmailOptions {
  const { to, orgName, amount, currency, reason, dueDate, provider, reference, message } = params;
  const currencyCode = currency || process.env.DEFAULT_CURRENCY || 'USD';
  const formatter = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode });
  const formattedAmount = formatter.format(amount);
  const formattedDueDate = dueDate
    ? dueDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'today';
  const reasonCopy = billingReasonCopy[reason];

  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', Arial, sans-serif; background-color: #F8FAFC; padding: 0; margin: 0;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 15px 40px rgba(15, 23, 42, 0.08); overflow: hidden;">
            <tr>
              <td style="padding: 28px 32px; background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%); color: white;">
                <img src="${LOGO_OUTLINE}" alt="ChainSync" width="72" height="72" style="display:block; margin-bottom: 12px;" />
                <p style="margin: 0 0 8px; letter-spacing: 0.08em; font-size: 12px; text-transform: uppercase; opacity: 0.85;">Billing alert</p>
                <h1 style="margin: 0; font-size: 22px; font-weight: 600;">${reasonCopy.title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px; color: #0F172A;">
                <p style="margin: 0 0 16px; color: #475569; line-height: 1.5;">${reasonCopy.body}</p>
                <div style="margin-bottom: 16px;">
                  <p style="margin:4px 0; color:#475569;"><strong>Organization:</strong> ${orgName}</p>
                  <p style="margin:4px 0; color:#475569;"><strong>Amount due:</strong> ${formattedAmount}</p>
                  <p style="margin:4px 0; color:#475569;"><strong>Due date:</strong> ${formattedDueDate}</p>
                  ${provider ? `<p style="margin:4px 0; color:#475569;"><strong>Provider:</strong> ${provider}</p>` : ''}
                  ${reference ? `<p style="margin:4px 0; color:#475569;"><strong>Reference:</strong> ${reference}</p>` : ''}
                </div>
                ${message ? `<p style="margin: 0 0 16px; color: #475569;">${message}</p>` : ''}
                <div style="margin-top: 12px;">
                  <a href="${process.env.APP_ORIGIN ?? 'https://app.chainsync.store'}/billing" style="display:inline-block; padding: 10px 18px; border-radius: 999px; background:#2563EB; color:#fff; text-decoration:none; font-weight:600;">Manage billing</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const textLines = [
    reasonCopy.title,
    reasonCopy.body,
    `Organization: ${orgName}`,
    `Amount due: ${formattedAmount}`,
    `Due date: ${formattedDueDate}`,
    provider ? `Provider: ${provider}` : null,
    reference ? `Reference: ${reference}` : null,
    message ?? null,
    `Manage billing: ${(process.env.APP_ORIGIN ?? 'https://app.chainsync.store')}/billing`,
  ].filter(Boolean) as string[];

  return {
    to,
    subject: `[Billing] ${reasonCopy.title}`,
    html,
    text: textLines.join('\n')
  };
}

export interface ProfileChangeOtpEmailParams {
  to: string;
  userName?: string | null;
  code: string;
  expiresAt: Date;
}

export function generateProfileChangeOtpEmail(params: ProfileChangeOtpEmailParams): EmailOptions {
  const { to, userName, code, expiresAt } = params;
  const friendlyName = userName?.trim()?.length ? userName.trim() : 'there';
  const formattedExpiry = expiresAt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', Arial, sans-serif; background-color: #f2f6fb; padding: 0; margin: 0;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);">
            <tr>
              <td style="background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%); padding: 28px 24px; text-align: center;">
                <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
                <p style="color: #ffffff; font-size: 20px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">Confirm your profile update</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 36px;">
                <p style="color: #0F172A; font-size: 16px; font-weight: 600; margin: 0 0 12px;">Hi ${friendlyName},</p>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
                  Use the one-time code below to confirm the email change you requested for your ChainSync account.
                </p>
                <div style="background: #EFF6FF; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 20px;">
                  <span style="display: inline-block; font-size: 34px; letter-spacing: 14px; font-weight: 700; color: #0F172A;">${code}</span>
                  <p style="color: #1D4ED8; font-size: 14px; font-weight: 500; margin: 16px 0 0;">
                    This code expires at ${formattedExpiry}.
                  </p>
                </div>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
                  If you didn’t request this change, you can safely ignore this email.
                </p>
                <p style="color: #94A3B8; font-size: 12px; line-height: 1.6; margin: 0;">
                  Need help? Contact us anytime at <a href="mailto:support@chainsync.com" style="color: #2563EB; font-weight: 600; text-decoration: none;">support@chainsync.com</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Hi ${friendlyName},

Use this code to confirm your ChainSync email change: ${code}

This code expires at ${formattedExpiry}.
If you didn’t request this change, you can ignore this email.

The ChainSync Team`;

  return {
    to,
    subject: 'Confirm your ChainSync email change',
    html,
    text,
  };
}

export interface MonitoringAlertEmailParams {
  to: string;
  title: string;
  message: string;
  level?: string;
  project?: string;
  environment?: string;
  url?: string;
  timestamp?: Date | string;
  tags?: Record<string, string | number | undefined>;
}

const monitoringSeverityColors: Record<string, { bg: string; text: string }> = {
  fatal: { bg: '#FEE2E2', text: '#B91C1C' },
  error: { bg: '#FEE2E2', text: '#B91C1C' },
  warning: { bg: '#FEF3C7', text: '#B45309' },
  info: { bg: '#DBEAFE', text: '#1D4ED8' },
  default: { bg: '#E2E8F0', text: '#475569' },
};

export function generateMonitoringAlertEmail(params: MonitoringAlertEmailParams): EmailOptions {
  const { to, title, message, level, project, environment, url, timestamp, tags } = params;
  const normalizedLevel = (level || 'error').toLowerCase();
  const color = monitoringSeverityColors[normalizedLevel] ?? monitoringSeverityColors.default;
  const formattedTimestamp = timestamp
    ? new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const tagEntries = tags ? Object.entries(tags).filter(([, value]) => value !== undefined && value !== null && value !== '') : [];

  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', Arial, sans-serif; background-color: #F8FAFC; padding: 0; margin: 0;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 15px 40px rgba(15, 23, 42, 0.08); overflow: hidden;">
            <tr>
              <td style="padding: 28px 32px; background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%); color: white;">
                <img src="${LOGO_OUTLINE}" alt="ChainSync" width="72" height="72" style="display:block; margin-bottom: 12px;" />
                <p style="margin: 0 0 8px; letter-spacing: 0.08em; font-size: 12px; text-transform: uppercase; opacity: 0.85;">Monitoring alert</p>
                <h1 style="margin: 0; font-size: 22px; font-weight: 600;">${title}</h1>
                <span style="display:inline-block; margin-top: 12px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background:${color.bg}; color:${color.text}; text-transform: uppercase;">${normalizedLevel}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px; color: #0F172A;">
                <p style="margin: 0 0 16px; color: #475569; line-height: 1.5;">${message}</p>
                <div style="margin-bottom: 16px;">
                  ${project ? `<p style="margin:4px 0; color:#475569;"><strong>Project:</strong> ${project}</p>` : ''}
                  ${environment ? `<p style="margin:4px 0; color:#475569;"><strong>Environment:</strong> ${environment}</p>` : ''}
                  <p style="margin:4px 0; color:#475569;"><strong>Timestamp:</strong> ${formattedTimestamp}</p>
                </div>
                ${tagEntries.length ? `<div style="margin-bottom: 16px;">
                  <p style="margin:0 0 8px; font-weight:600;">Tags</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                    ${tagEntries
                      .map(([k, v]) => `<tr>
                          <td style="padding:6px 8px; background:#F8FAFC; border:1px solid #E2E8F0; font-size:13px; width:35%;">${k}</td>
                          <td style="padding:6px 8px; border:1px solid #E2E8F0; font-size:13px;">${String(v)}</td>
                        </tr>`)
                      .join('')}
                  </table>
                </div>` : ''}
                ${url ? `<div style="margin-top: 12px;"><a href="${url}" style="display:inline-block; padding: 10px 18px; border-radius: 999px; background:#2563EB; color:#fff; text-decoration:none; font-weight:600;">View in Sentry</a></div>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const textLines = [
    `Monitoring alert: ${title}`,
    `Level: ${normalizedLevel}`,
    message,
    project ? `Project: ${project}` : null,
    environment ? `Environment: ${environment}` : null,
    `Timestamp: ${formattedTimestamp}`,
    ...(tagEntries.map(([k, v]) => `${k}: ${v}`)),
    url ? `View event: ${url}` : null,
  ].filter(Boolean) as string[];

  return {
    to,
    subject: `[${normalizedLevel.toUpperCase()}] ${title}`,
    html,
    text: textLines.join('\n'),
  };
}

const fallbackOutlineSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60' viewBox='0 0 120 60'><rect width='120' height='60' rx='8' fill='white'/><rect x='15' y='12' width='90' height='8' rx='4' fill='%232196F3'/><rect x='15' y='26' width='90' height='8' rx='4' fill='%232196F3'/><rect x='15' y='40' width='90' height='8' rx='4' fill='%232196F3'/></svg>`;
const outlineAsset = loadLogoAsset('chainsync-logo-outline.png', 'image/png', fallbackOutlineSvg);
const LOGO_OUTLINE_CID = 'chainsync-logo-outline';
const LOGO_OUTLINE = `cid:${LOGO_OUTLINE_CID}`;
const BRANDING_ATTACHMENTS = [
  {
    filename: 'chainsync-logo-outline.png',
    content: outlineAsset.buffer,
    cid: LOGO_OUTLINE_CID,
    contentType: outlineAsset.mimeType,
  },
];

// Lightweight, non-sensitive health state for SMTP transporter
let emailTransporterStatus = {
  ok: false,
  lastChecked: 0,
};

export function getEmailHealth() {
  return {
    ok: emailTransporterStatus.ok,
    lastChecked: emailTransporterStatus.lastChecked,
  };
}

export function generateTrialPaymentReminderEmail(
  userEmail: string,
  userName: string | null | undefined,
  organizationName: string | null | undefined,
  daysRemaining: number,
  trialEndsAt: Date,
  billingUrl?: string,
  supportEmail?: string
): EmailOptions {
  const friendlyName = userName?.trim()?.length ? userName.trim() : 'there';
  const formattedTrialEnd = trialEndsAt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const frontendUrl = process.env.FRONTEND_URL || 'https://app.chainsync.com';
  const helpEmail = supportEmail || process.env.SUPPORT_EMAIL || 'support@chainsync.com';
  const ctaUrl = billingUrl || `${frontendUrl}/settings/billing`;
  const orgLabel = organizationName?.trim()?.length ? ` for <strong>${organizationName.trim()}</strong>` : '';
  const urgencyCopy = daysRemaining === 3
    ? 'Only a few days remain in your free trial — set up automatic billing now to avoid any disruption.'
    : 'You are halfway through your free trial — add a payment method today so your workspace stays active when the trial ends.';

  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', Arial, sans-serif; background-color: #f2f6fb; padding: 0; margin: 0;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgba(33, 150, 243, 0.12);">
            <tr>
              <td style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); padding: 32px 24px; text-align: center;">
                <img src="${LOGO_OUTLINE}" alt="ChainSync" width="100" height="100" style="display: block; margin: 0 auto 16px;" />
                <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: 0.4px;">Keep your workspace active</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 40px;">
                <p style="color: #0F172A; font-size: 18px; font-weight: 600; margin: 0 0 16px;">Hi ${friendlyName},</p>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                  ${urgencyCopy}
                </p>
                <div style="background: #E3F2FD; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                  <p style="color: #1E3A8A; font-size: 16px; font-weight: 600; margin: 0 0 8px;">Trial ends on ${formattedTrialEnd}</p>
                  <p style="color: #0F172A; font-size: 14px; margin: 0;">Add a payment method now to automatically continue your plan${orgLabel}.</p>
                </div>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${ctaUrl}"
                     style="background: #2196F3; color: #ffffff; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block; box-shadow: 0 10px 24px rgba(33, 150, 243, 0.3);">
                    Set up automatic billing
                  </a>
                </div>
                <p style="color: #64748B; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
                  When your trial ends, we’ll securely charge the saved payment method so you maintain uninterrupted access for your team.
                </p>
                <p style="color: #64748B; font-size: 14px; line-height: 1.6; margin: 0;">
                  Need help? Reach us anytime at <a href="mailto:${helpEmail}" style="color: #2196F3; font-weight: 600; text-decoration: none;">${helpEmail}</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background: #F1F5F9; padding: 20px 24px; text-align: center;">
                <p style="color: #94A3B8; font-size: 12px; line-height: 1.6; margin: 0;">
                  ChainSync · Smarter retail operations, unified.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Hi ${friendlyName},

Your ChainSync trial ends on ${formattedTrialEnd}. Add a payment method now so we can continue your workspace automatically when the trial wraps up.

Set up automatic billing: ${ctaUrl}
Need help? Contact ${helpEmail}.

The ChainSync Team`;

  return {
    to: userEmail,
    subject: `Action needed: add a payment method before your trial ends`,
    html,
    text,
  };
}

export interface StaffCredentialEmailPayload {
  staffEmail: string;
  staffName?: string | null;
  temporaryPassword: string;
  storeName?: string;
  assignedRole?: string;
  invitedBy?: string;
}

export function generateStaffCredentialsEmail(payload: StaffCredentialEmailPayload): EmailOptions {
  const {
    staffEmail,
    staffName,
    temporaryPassword,
    storeName,
    assignedRole,
    invitedBy,
  } = payload;

  const friendlyName = staffName?.trim() || 'Team Member';
  const roleLabel = assignedRole ? assignedRole.charAt(0).toUpperCase() + assignedRole.slice(1) : 'Team Member';
  const inviter = invitedBy || 'your administrator';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const subject = `Your ChainSync access for ${storeName || 'store'}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 20px; text-align: center;">
        <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        <h1 style="color: white; margin: 0; font-size: 24px;">Staff Access</h1>
      </div>
      <div style="padding: 24px; background: #f9fafb;">
        <p style="color: #111827; font-size: 16px;">Hello ${friendlyName},</p>
        <p style="color: #374151; line-height: 1.6;">
          ${inviter} has created a ChainSync account for you${storeName ? ` to help manage <strong>${storeName}</strong>` : ''}.
        </p>
        <div style="background: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Login Credentials</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Email:</strong> ${staffEmail}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Temporary Password:</strong> <span style="font-family: 'Courier New', monospace;">${temporaryPassword}</span></p>
          <p style="margin: 8px 0; color: #374151;"><strong>Role:</strong> ${roleLabel}</p>
        </div>
        <p style="color: #374151; line-height: 1.6;">
          For security, please sign in as soon as possible and update your password. You can log in here:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${frontendUrl}/login" style="background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Go to ChainSync
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          If you did not expect this invitation, please contact your administrator immediately.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">This email was sent automatically by ChainSync. Do not reply.</p>
      </div>
    </div>
  `;

  const text = `
Hello ${friendlyName},

${inviter} created a ChainSync account for you${storeName ? ` to manage ${storeName}` : ''}.

Login credentials:
- Email: ${staffEmail}
- Temporary Password: ${temporaryPassword}
- Role: ${roleLabel}

Please sign in at ${frontendUrl}/login and change your password immediately.

If you did not expect this invitation, contact your administrator.
`;

  return {
    to: staffEmail,
    subject,
    html,
    text,
  };
}

export function generateEmailVerificationEmail(
  userEmail: string,
  userName: string,
  verificationUrl: string,
  trialEndDate?: Date
): EmailOptions {
  const friendlyName = userName?.trim().length ? userName.trim() : 'there';
  const trialMessage = trialEndDate
    ? `<p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Your 14-day free trial is already active and will end on <strong>${trialEndDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.</p>`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 20px; text-align: center;">
        <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        <h1 style="color: white; margin: 0; font-size: 24px;">Verify your account</h1>
      </div>
      <div style="padding: 28px; background: #f9fafb;">
        <p style="color: #374151; font-size: 16px;">Hello ${friendlyName},</p>
        <p style="color: #4b5563; line-height: 1.6;">
          Thanks for signing up for ChainSync! Please confirm your email address so we can secure your account and finish setting things up.
        </p>
        ${trialMessage}
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationUrl}"
             style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    padding: 15px 30px;
                    text-decoration: none;
                    border-radius: 6px;
                    display: inline-block;
                    font-weight: bold;">
            Verify Email
          </a>
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          Or copy and paste this link in your browser:
        </p>
        <p style="word-break: break-all; color: #6366f1;">
          ${verificationUrl}
        </p>
        <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin-top: 32px;">
          If you didn’t create this account, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  const text = `Hello ${friendlyName},

Thanks for signing up for ChainSync! Confirm your email address to activate your account.

${trialEndDate ? `Your 14-day free trial is active and will end on ${trialEndDate.toLocaleDateString()}.\n\n` : ''}Verify your email: ${verificationUrl}

If you didn’t create this account, you can ignore this message.`;

  return {
    to: userEmail,
    subject: 'Confirm your ChainSync email',
    html,
    text,
  };
}

export function generateSignupOtpEmail(
  userEmail: string,
  userName: string,
  otpCode: string,
  expiresAt: Date,
  supportEmail?: string
): EmailOptions {
  const friendlyName = userName?.trim().length ? userName.trim() : 'there';
  const formattedExpiry = expiresAt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const frontendUrl = process.env.FRONTEND_URL || 'https://app.chainsync.com';
  const helpEmail = supportEmail || process.env.SUPPORT_EMAIL || 'support@chainsync.com';
  // Logo is now loaded from assets

  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', Arial, sans-serif; background-color: #f2f6fb; padding: 0; margin: 0;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgba(33, 150, 243, 0.12);">
            <tr>
              <td style="background: #2196F3; padding: 32px 24px; text-align: center;">
                <img src="${LOGO_OUTLINE}" alt="ChainSync" width="100" height="100" style="display: block; margin: 0 auto 12px;" />
                <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: 0.4px;">Confirm Your Signup</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 40px;">
                <p style="color: #0F172A; font-size: 18px; font-weight: 600; margin: 0 0 16px;">Hi ${friendlyName},</p>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                  Welcome to <strong>ChainSync</strong>! Enter the one-time passcode below to finish setting up your workspace and unlock your 14-day free trial.
                </p>
                <div style="background: #E3F2FD; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 28px;">
                  <span style="display: inline-block; font-size: 32px; letter-spacing: 12px; font-weight: 700; color: #0F172A;">${otpCode}</span>
                  <p style="color: #1E3A8A; font-size: 14px; font-weight: 500; margin: 16px 0 0;">
                    This passcode expires at ${formattedExpiry}.
                  </p>
                </div>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                  You can enter this code directly in your browser or use the button below to resume your signup flow.
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${frontendUrl}/signup/verify-otp" style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: #ffffff; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block; box-shadow: 0 12px 24px rgba(33, 150, 243, 0.28);">
                    Continue Signup
                  </a>
                </div>
                <p style="color: #64748B; font-size: 14px; line-height: 1.6; margin: 0 0 10px;">
                  Didn’t request this code? Simply ignore this email—it will expire shortly.
                </p>
                <p style="color: #64748B; font-size: 14px; line-height: 1.6; margin: 0;">
                  Need help? Reach us anytime at <a href="mailto:${helpEmail}" style="color: #2196F3; font-weight: 600; text-decoration: none;">${helpEmail}</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background: #F1F5F9; padding: 20px 24px; text-align: center;">
                <p style="color: #94A3B8; font-size: 12px; line-height: 1.6; margin: 0;">
                  ChainSync · Smarter retail operations, unified.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Hi ${friendlyName},

Welcome to ChainSync! Use the one-time passcode below to finish setting up your workspace:

${otpCode}

This code expires at ${formattedExpiry}. If you didn’t request this, you can ignore this email.

Continue your signup: ${frontendUrl}/signup/verify-otp
Need help? Contact us at ${helpEmail}.

The ChainSync Team`;

  return {
    to: userEmail,
    subject: 'Your ChainSync verification code',
    html,
    text,
  };
}

export interface StorePerformanceEmailParams {
  to: string;
  storeName: string;
  snapshotDate: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  grossRevenue: number;
  netRevenue: number;
  transactionsCount: number;
  averageOrderValue: number;
  revenueDeltaPct?: number | null;
  transactionsDeltaPct?: number | null;
  refundRatio?: number | null;
  comparisonWindowLabel: string;
  topProduct?: { name: string; revenue: number; quantity: number } | null;
  currency?: string;
}

const severityPillColors: Record<StorePerformanceEmailParams['severity'], { bg: string; text: string }> = {
  critical: { bg: '#FEE2E2', text: '#B91C1C' },
  high: { bg: '#FEF3C7', text: '#B45309' },
  medium: { bg: '#E0F2FE', text: '#075985' },
  low: { bg: '#E2E8F0', text: '#475569' },
};

export function generateStorePerformanceAlertEmail(params: StorePerformanceEmailParams): EmailOptions {
  const {
    to,
    storeName,
    snapshotDate,
    severity,
    grossRevenue,
    netRevenue,
    transactionsCount,
    averageOrderValue,
    revenueDeltaPct,
    transactionsDeltaPct,
    refundRatio,
    comparisonWindowLabel,
    topProduct,
    currency,
  } = params;

  const currencyCode = currency || process.env.DEFAULT_CURRENCY || 'USD';
  const moneyFormatter = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode });
  const percentFormatter = new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const severityCopy: Record<typeof severity, { title: string; body: string }> = {
    critical: {
      title: 'Critical performance decline detected',
      body: 'Immediate attention is required to investigate and stabilize this store\'s sales performance.',
    },
    high: {
      title: 'Significant performance change',
      body: 'This store is experiencing a notable shift in revenue or refunds that may need intervention.',
    },
    medium: {
      title: 'Performance update',
      body: 'Sales performance moved materially compared to the recent baseline.',
    },
    low: {
      title: 'Performance highlight',
      body: 'Here is the latest snapshot compared to the recent baseline.',
    },
  };

  const pillColors = severityPillColors[severity];
  const formattedDate = snapshotDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const metricsRows = [
    { label: 'Gross revenue', value: moneyFormatter.format(grossRevenue) },
    { label: 'Net revenue', value: moneyFormatter.format(netRevenue) },
    { label: 'Transactions', value: transactionsCount.toLocaleString() },
    { label: 'Average order value', value: moneyFormatter.format(averageOrderValue) },
  ];

  const deltasRows = [
    typeof revenueDeltaPct === 'number' ? { label: 'Revenue delta vs baseline', value: percentFormatter.format(revenueDeltaPct / 100) } : null,
    typeof transactionsDeltaPct === 'number' ? { label: 'Transaction delta vs baseline', value: percentFormatter.format(transactionsDeltaPct / 100) } : null,
    typeof refundRatio === 'number' ? { label: 'Refund ratio', value: percentFormatter.format(refundRatio) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const topProductBlock = topProduct
    ? `<div style="margin-top: 16px; padding: 16px; border: 1px solid #E2E8F0; border-radius: 12px;">
        <p style="margin: 0 0 4px; font-weight: 600; color: #0F172A;">Top product driver</p>
        <p style="margin: 0; color: #475569;">${topProduct.name} — ${moneyFormatter.format(topProduct.revenue)} from ${topProduct.quantity.toLocaleString()} units</p>
      </div>`
    : '';

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Inter', Arial, sans-serif; background-color: #F8FAFC; padding: 0; margin: 0;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; background-color: #ffffff; border-radius: 18px; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08); overflow: hidden;">
            <tr>
              <td style="padding: 32px 40px; background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%); color: white;">
                <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin-bottom: 12px;" />
                <p style="margin: 0 0 12px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; opacity: 0.8;">Store performance alert</p>
                <h1 style="margin: 0; font-size: 26px; font-weight: 600;">${storeName}</h1>
                <p style="margin: 8px 0 0; opacity: 0.85;">Snapshot for ${formattedDate}</p>
                <span style="display: inline-block; margin-top: 16px; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; background: ${pillColors.bg}; color: ${pillColors.text};">
                  ${severity.toUpperCase()}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 40px;">
                <h2 style="margin: 0 0 12px; font-size: 20px; color: #0F172A;">${severityCopy[severity].title}</h2>
                <p style="margin: 0 0 20px; color: #475569;">${severityCopy[severity].body}</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
                  ${metricsRows
                    .map(
                      (row) => `
                        <div style="padding: 16px; border: 1px solid #E2E8F0; border-radius: 12px;">
                          <p style="margin: 0; color: #94A3B8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">${row.label}</p>
                          <p style="margin: 6px 0 0; color: #0F172A; font-size: 20px; font-weight: 600;">${row.value}</p>
                        </div>`
                    )
                    .join('')}
                </div>
                ${
                  deltasRows.length
                    ? `<div style="margin-top: 24px; padding: 16px; border: 1px solid #E2E8F0; border-radius: 12px;">
                        <p style="margin: 0 0 8px; color: #0F172A; font-weight: 600;">Vs ${comparisonWindowLabel}</p>
                        ${deltasRows
                          .map((row) => `<p style="margin: 4px 0; color: #475569;"><strong>${row.label}:</strong> ${row.value}</p>`)
                          .join('')}
                      </div>`
                    : ''
                }
                ${topProductBlock}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const textLines = [
    `${storeName} performance alert for ${formattedDate}.`,
    severityCopy[severity].title,
    `Gross revenue: ${moneyFormatter.format(grossRevenue)}`,
    `Net revenue: ${moneyFormatter.format(netRevenue)}`,
    `Transactions: ${transactionsCount.toLocaleString()}`,
    `Average order value: ${moneyFormatter.format(averageOrderValue)}`,
  ];
  if (typeof revenueDeltaPct === 'number') {
    textLines.push(`Revenue delta vs ${comparisonWindowLabel}: ${percentFormatter.format(revenueDeltaPct / 100)}`);
  }
  if (typeof transactionsDeltaPct === 'number') {
    textLines.push(`Transaction delta vs ${comparisonWindowLabel}: ${percentFormatter.format(transactionsDeltaPct / 100)}`);
  }
  if (typeof refundRatio === 'number') {
    textLines.push(`Refund ratio: ${percentFormatter.format(refundRatio)}`);
  }
  if (topProduct) {
    textLines.push(`Top product: ${topProduct.name} (${moneyFormatter.format(topProduct.revenue)})`);
  }

  return {
    to,
    subject: `${storeName} performance alert – ${severityCopy[severity].title}`,
    html,
    text: textLines.join('\n'),
  };
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
    cid?: string;
  }[];
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    const inlineAttachments = (options.attachments ?? []).length
      ? options.attachments
      : BRANDING_ATTACHMENTS;

    const mailOptions = {
      from: process.env.SMTP_FROM || emailConfig.auth.user,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: inlineAttachments,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

export async function verifyEmailTransporter(): Promise<boolean> {
  try {
    await transporter.verify();
    emailTransporterStatus = { ok: true, lastChecked: Date.now() };
    console.log('[email] SMTP transporter verified OK');
    return true;
  } catch (error) {
    emailTransporterStatus = { ok: false, lastChecked: Date.now() };
    console.error('[email] SMTP transporter verification failed:', error);
    return false;
  }
}

export function generateWelcomeEmail(userEmail: string, userName: string, tier: string, companyName: string): EmailOptions {
  return {
    to: userEmail,
    subject: 'Welcome to ChainSync! Your Account is Ready',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Welcome to ChainSync, ${userName}! 🎉</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Thank you for choosing ChainSync! Your account has been successfully created and activated.
          </p>
          
          <div style="background: #e8f4fd; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <h3 style="color: #333; margin-top: 0;">Account Details</h3>
            <p style="color: #666; margin: 5px 0;"><strong>Company:</strong> ${companyName}</p>
            <p style="color: #666; margin: 5px 0;"><strong>Subscription Tier:</strong> ${tier.charAt(0).toUpperCase() + tier.slice(1)}</p>
            <p style="color: #666; margin: 5px 0;"><strong>Status:</strong> Active</p>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            You can now access all the features included in your ${tier} plan. Here's what you can do:
          </p>
          
          <ul style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            <li>Manage your inventory and track stock levels</li>
            <li>Process sales through our POS system</li>
            <li>Generate detailed analytics and reports</li>
            <li>Manage multiple store locations</li>
            <li>Access AI-powered insights and forecasting</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      display: inline-block; 
                      font-weight: bold;">
              Get Started with ChainSync
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            If you have any questions or need assistance getting started, our support team is here to help.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from ChainSync. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
      Welcome to ChainSync!
      
      Hello ${userName},
      
      Thank you for choosing ChainSync! Your account has been successfully created and activated.
      
      Account Details:
      - Company: ${companyName}
      - Subscription Tier: ${tier.charAt(0).toUpperCase() + tier.slice(1)}
      - Status: Active
      
      You can now access all the features included in your ${tier} plan, including:
      - Inventory management and stock tracking
      - POS system for sales processing
      - Analytics and reporting
      - Multi-store management
      - AI-powered insights and forecasting
      
      Get started by visiting: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard
      
      If you have any questions or need assistance, our support team is here to help.
      
      Best regards,
      The ChainSync Team
    `
  };
}

export function generatePasswordResetEmail(userEmail: string, resetToken: string, userName: string): EmailOptions {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
  
  return {
    to: userEmail,
    subject: 'ChainSync - Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Hello ${userName},
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password for your ChainSync account. 
            If you didn't make this request, you can safely ignore this email.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      display: inline-block; 
                      font-weight: bold;">
              Reset Your Password
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            This link will expire in 24 hours for security reasons.
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            If the button above doesn't work, you can copy and paste this link into your browser:
          </p>
          
          <p style="color: #667eea; word-break: break-all; margin-bottom: 20px;">
            ${resetUrl}
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from ChainSync. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
      ChainSync - Password Reset Request
      
      Hello ${userName},
      
      We received a request to reset your password for your ChainSync account. 
      If you didn't make this request, you can safely ignore this email.
      
      To reset your password, click the following link:
      ${resetUrl}
      
      This link will expire in 24 hours for security reasons.
      
      This is an automated message from ChainSync. Please do not reply to this email.
    `
  };
}

export function generatePasswordResetSuccessEmail(userEmail: string, userName: string): EmailOptions {
  return {
    to: userEmail,
    subject: 'ChainSync - Password Successfully Reset',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Password Successfully Reset</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Hello ${userName},
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Your ChainSync account password has been successfully reset. 
            You can now log in with your new password.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      display: inline-block; 
                      font-weight: bold;">
              Log In to ChainSync
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            If you didn't reset your password, please contact our support team immediately.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from ChainSync. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
      ChainSync - Password Successfully Reset
      
      Hello ${userName},
      
      Your ChainSync account password has been successfully reset. 
      You can now log in with your new password.
      
      If you didn't reset your password, please contact our support team immediately.
      
      This is an automated message from ChainSync. Please do not reply to this email.
    `
  };
}

export function generateProfileUpdateEmail(userEmail: string, oldProfile: any, newProfile: any): EmailOptions {
  function diffRow(label: string, oldVal: string, newVal: string) {
    if (oldVal === newVal) return '';
    return `<tr><td style='padding:4px 8px;'>${label}</td><td style='padding:4px 8px;color:#888;'>${oldVal || '-'}</td><td style='padding:4px 8px;color:#2d7a2d;'>${newVal || '-'}</td></tr>`;
  }
  return {
    to: userEmail,
    subject: 'Your ChainSync Profile Was Updated',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Profile Updated</h2>
          <p style="color: #666;">Your profile information was recently updated. If you did not make this change, please contact support immediately.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <thead><tr><th>Field</th><th>Old Value</th><th>New Value</th></tr></thead>
            <tbody>
              ${diffRow('First Name', oldProfile.firstName, newProfile.firstName)}
              ${diffRow('Last Name', oldProfile.lastName, newProfile.lastName)}
              ${diffRow('Email', oldProfile.email, newProfile.email)}
              ${diffRow('Phone', oldProfile.phone, newProfile.phone)}
              ${diffRow('Company', oldProfile.companyName, newProfile.companyName)}
              ${diffRow('Location', oldProfile.location, newProfile.location)}
            </tbody>
          </table>
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from ChainSync. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Your ChainSync profile was updated. If you did not make this change, contact support.\n\nOld profile: ${JSON.stringify(oldProfile)}\nNew profile: ${JSON.stringify(newProfile)}`
  };
}

export function generateSubscriptionTierChangeEmail(userEmail: string, userName: string, oldTier: string, newTier: string): EmailOptions {
  return {
    to: userEmail,
    subject: 'Your ChainSync Subscription Tier Has Changed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Subscription Tier Changed</h2>
          <p style="color: #666;">Hello ${userName},</p>
          <p style="color: #666;">Your ChainSync subscription tier has changed:</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <thead><tr><th>Old Tier</th><th>New Tier</th></tr></thead>
            <tbody>
              <tr><td style='padding:4px 8px;color:#888;'>${oldTier}</td><td style='padding:4px 8px;color:#2d7a2d;'>${newTier}</td></tr>
            </tbody>
          </table>
          <p style="color: #666;">If you did not request this change, please contact support immediately.</p>
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from ChainSync. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Hello ${userName},\n\nYour ChainSync subscription tier has changed from ${oldTier} to ${newTier}. If you did not request this change, please contact support.\n\nThis is an automated message from ChainSync. Please do not reply to this email.`
  };
}

export function generatePaymentConfirmationEmail(userEmail: string, userName: string, amount: number, currency: string, reference: string): EmailOptions {
  return {
    to: userEmail,
    subject: 'Payment Confirmation - ChainSync',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Payment Confirmation</h2>
          <p style="color: #666;">Hello ${userName},</p>
          <p style="color: #666;">We have received your payment.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <thead><tr><th>Amount</th><th>Currency</th><th>Reference</th></tr></thead>
            <tbody>
              <tr><td style='padding:4px 8px;color:#2d7a2d;'>${amount}</td><td style='padding:4px 8px;'>${currency}</td><td style='padding:4px 8px;color:#888;'>${reference}</td></tr>
            </tbody>
          </table>
          <p style="color: #666;">Thank you for your business!</p>
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from ChainSync. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Hello ${userName},\n\nWe have received your payment of ${amount} ${currency}. Reference: ${reference}.\nThank you for your business!\n\nThis is an automated message from ChainSync. Please do not reply to this email.`
  };
}

export function generatePasswordChangeAlertEmail(userEmail: string, userName: string): EmailOptions {
  return {
    to: userEmail,
    subject: 'Password Changed - ChainSync',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Password Changed</h2>
          <p style="color: #666;">Hello ${userName},</p>
          <p style="color: #666;">Your password was recently changed. If you did not perform this action, please reset your password immediately or contact support.</p>
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from ChainSync. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Hello ${userName},\n\nYour password was recently changed. If this was not you, please reset your password or contact support.\n\nThis is an automated message from ChainSync. Please do not reply to this email.`
  };
}

export function generateAccountDeletionEmail(userEmail: string, userName: string): EmailOptions {
  return {
    to: userEmail,
    subject: 'Account Deleted - ChainSync',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <img src="${LOGO_OUTLINE}" alt="ChainSync" width="80" height="80" style="display: block; margin: 0 auto 12px;" />
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Account Deleted</h2>
          <p style="color: #666;">Hello ${userName},</p>
          <p style="color: #666;">Your ChainSync account has been deleted. If you did not request this, please contact support immediately.</p>
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from ChainSync. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Hello ${userName},\n\nYour ChainSync account has been deleted. If this was not you, please contact support immediately.\n\nThis is an automated message from ChainSync. Please do not reply to this email.`
  };
}