import nodemailer from 'nodemailer';

// Email configuration - in production, use environment variables
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password',
  },
};

// Create transporter
const transporter = nodemailer.createTransporter(emailConfig);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const mailOptions = {
      from: emailConfig.auth.user,
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