const nodemailer = require('nodemailer');
const config = require('../config/env');

let transporterInstance = null;

/**
 * Get or create Nodemailer Transporter instance
 */
function getTransporter() {
  if (transporterInstance) {
    return transporterInstance;
  }

  // Gmail SMTP Transport
  if (config.email.service === 'gmail' || config.email.host.includes('gmail')) {
    transporterInstance = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email.user.trim(),
        pass: config.email.pass.replace(/\s+/g, '').trim(), // Ensure 16-character string without spaces
      },
    });
    return transporterInstance;
  }

  // Generic SMTP Transport
  transporterInstance = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.user.trim(),
      pass: config.email.pass.replace(/\s+/g, '').trim(),
    },
  });

  return transporterInstance;
}

/**
 * Generate beautifully styled HTML email template for password reset
 */
function renderPasswordResetTemplate({ userName, otp, appName }) {
  const brandName = appName || 'Radhika Mehndi Studio';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Code - ${brandName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f4f5f7;
      color: #334155;
      -webkit-font-smoothing: antialiased;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 30px auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header-banner {
      background: linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #ea580c 100%);
      padding: 36px 30px;
      text-align: center;
      color: #ffffff;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin: 0 0 6px 0;
      text-transform: uppercase;
    }
    .brand-subtitle {
      font-size: 14px;
      font-weight: 500;
      opacity: 0.92;
      margin: 0;
      letter-spacing: 1px;
    }
    .content-body {
      padding: 36px 32px 30px 32px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 0;
      margin-bottom: 14px;
    }
    .message-text {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .otp-card {
      background: #fff7ed;
      border: 2px dashed #f97316;
      border-radius: 14px;
      padding: 24px 20px;
      text-align: center;
      margin: 28px 0;
    }
    .otp-label {
      font-size: 12px;
      font-weight: 700;
      color: #c2410c;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 8px;
    }
    .otp-code {
      font-size: 38px;
      font-weight: 900;
      letter-spacing: 10px;
      color: #7c2d12;
      font-family: 'Courier New', Courier, monospace;
      margin: 4px 0 8px 0;
      display: inline-block;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.05);
    }
    .otp-expiry {
      font-size: 13px;
      color: #ea580c;
      font-weight: 600;
      margin: 0;
    }
    .info-box {
      background: #f8fafc;
      border-left: 4px solid #f97316;
      padding: 14px 18px;
      border-radius: 6px;
      font-size: 13.5px;
      color: #64748b;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .security-notice {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      border-top: 1px solid #f1f5f9;
      padding-top: 18px;
      margin-top: 20px;
    }
    .footer {
      background: #fafaf9;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #a8a29e;
      border-top: 1px solid #f5f5f4;
    }
    .footer a {
      color: #c2410c;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header-banner">
      <h1 class="brand-title">${brandName}</h1>
      <p class="brand-subtitle">Password Reset Verification</p>
    </div>

    <div class="content-body">
      <h2 class="greeting">Hello, ${userName || 'User'}!</h2>
      <p class="message-text">
        We received a request to reset the password for your account. Please use the following 6-digit verification code to reset your password.
      </p>

      <div class="otp-card">
        <div class="otp-label">Your Verification Code</div>
        <div class="otp-code">${otp}</div>
        <p class="otp-expiry">⏱️ Valid for 10 minutes only</p>
      </div>

      <div class="info-box">
        <strong>Security Notice:</strong> Never share this verification code with anyone. Our support team will never ask for your code or password.
      </div>

      <div class="security-notice">
        If you did not request this password reset, please ignore this email. Your current password remains completely safe and unchanged.
      </div>
    </div>

    <div class="footer">
      <p style="margin: 0 0 6px 0;">&copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
      <p style="margin: 0;">This is an automated security email. Please do not reply directly to this message.</p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Send 6-digit verification code email for password reset
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.otp - 6-digit code
 * @param {string} options.userName - User's name
 */
async function sendPasswordResetEmail({ to, otp, userName }) {
  const brandName = config.appName || 'Radhika Mehndi Studio';

  // If user has not yet configured credentials in .env, handle gracefully in dev mode
  if (!config.email.isConfigured) {
    console.warn(`\n======================================================`);
    console.warn(`📬 [Nodemailer Dev Fallback]`);
    console.warn(`EMAIL_USER or EMAIL_PASS is not configured in .env yet.`);
    console.warn(`👉 Password Reset OTP for [${to}] is: [ ${otp} ]`);
    console.warn(`👉 Once you add your EMAIL_USER & 16-digit App Password to .env,`);
    console.warn(`   emails will automatically be delivered to inboxes.`);
    console.warn(`======================================================\n`);

    return {
      success: true,
      preview: true,
      message: 'OTP generated. (Logged to server console because email credentials are not yet set in .env).',
    };
  }

  const transporter = getTransporter();
  const senderEmail = config.email.user.trim();

  const mailOptions = {
    from: `"${brandName}" <${senderEmail}>`,
    to: to.trim().toLowerCase(),
    subject: `🔐 ${otp} is your ${brandName} Password Reset Code`,
    text: `Hello ${userName || 'User'},\n\nYour 6-digit verification code for resetting your password is: ${otp}\n\nThis code is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nRegards,\n${brandName}`,
    html: renderPasswordResetTemplate({ userName, otp, appName: brandName }),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [Nodemailer] Password reset email sent to ${to} (MessageID: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(`❌ [Nodemailer Error] Failed to send email to ${to}:`, error.message);
    throw new Error(`Email delivery failed: ${error.message}. Please check your EMAIL_USER and 16-digit App Password in .env.`);
  }
}

module.exports = {
  getTransporter,
  sendPasswordResetEmail,
};

