import nodemailer from 'nodemailer';

// Email configuration - in production, use environment variables
const resolvedPort = parseInt(process.env.SMTP_PORT || '587', 10);
const resolvedSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : resolvedPort === 465;

const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.mailersend.net',
  port: resolvedPort,
  secure: resolvedSecure, // true for 465, false for other ports unless overridden
  auth: {
    user: process.env.SMTP_USER || 'your-mailersend-username',
    pass: process.env.SMTP_PASS || 'your-mailersend-api-key',
  },
};

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
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
    return true;
  } catch (error) {
    console.error('SMTP transporter verification failed:', error);
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