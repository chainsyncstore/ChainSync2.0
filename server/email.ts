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

const loadLogoDataUri = (fileName: string, fallback: string): string => {
  try {
    const fileBuffer = readFileSync(path.join(brandingDir, fileName));
    return `data:image/svg+xml;base64,${Buffer.from(fileBuffer).toString('base64')}`;
  } catch (error) {
    console.warn(`ChainSync logo asset missing (${fileName}). Using fallback.`, error);
    return fallback;
  }
};

const inlineFallbackLogo = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60' viewBox='0 0 120 60'><rect width='120' height='60' rx='8' fill='%232196F3'/><rect x='15' y='12' width='90' height='8' rx='4' fill='white'/><rect x='15' y='26' width='90' height='8' rx='4' fill='white'/><rect x='15' y='40' width='90' height='8' rx='4' fill='white'/></svg>`;

const LOGO_OUTLINE = loadLogoDataUri('chainsync-logo-outline.svg', inlineFallbackLogo.replace('%232196F3', 'white').replace('white', '%232196F3'));

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

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }[];
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    const mailOptions = {
      from: process.env.SMTP_FROM || emailConfig.auth.user,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
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