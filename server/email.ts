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
        <h1 style="color: white; margin: 0; font-size: 24px;">ChainSync Staff Access</h1>
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

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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

export function generateLowStockAlertEmail(userEmail: string, userName: string, productName: string, quantity: number, minStockLevel: number): EmailOptions {
  return {
    to: userEmail,
    subject: 'Low Stock Alert - ChainSync',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">ChainSync</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Low Stock Alert</h2>
          <p style="color: #666;">Hello ${userName},</p>
          <p style="color: #666;">The following product is low on stock:</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <thead><tr><th>Product</th><th>Current Qty</th><th>Min Level</th></tr></thead>
            <tbody>
              <tr><td style='padding:4px 8px;'>${productName}</td><td style='padding:4px 8px;color:#e67e22;'>${quantity}</td><td style='padding:4px 8px;color:#c0392b;'>${minStockLevel}</td></tr>
            </tbody>
          </table>
          <p style="color: #666;">Please restock soon to avoid running out.</p>
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from ChainSync. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Hello ${userName},\n\nThe product '${productName}' is low on stock. Current quantity: ${quantity}, Minimum level: ${minStockLevel}. Please restock soon.\n\nThis is an automated message from ChainSync. Please do not reply to this email.`
  };
}

export function generatePasswordChangeAlertEmail(userEmail: string, userName: string): EmailOptions {
  return {
    to: userEmail,
    subject: 'Password Changed - ChainSync',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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
          <h1 style="color: white; margin: 0;">ChainSync</h1>
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