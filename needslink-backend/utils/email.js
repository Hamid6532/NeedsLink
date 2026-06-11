const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendMail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }
};

const emailTemplates = {
  verifyEmail: (name, token) => ({
    subject: 'Verify your NeedsLink email address',
    html: `
      <h2>Welcome to NeedsLink, ${name}!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${process.env.CLIENT_URL}/verify-email?token=${token}" style="padding:10px 20px;background:#2E74B5;color:#fff;text-decoration:none;border-radius:5px;">
        Verify Email
      </a>
      <p>This link expires in 24 hours.</p>
    `,
  }),

  resetPassword: (name, token) => ({
    subject: 'Reset your NeedsLink password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Hi ${name}, click below to reset your password:</p>
      <a href="${process.env.CLIENT_URL}/reset-password?token=${token}" style="padding:10px 20px;background:#2E74B5;color:#fff;text-decoration:none;border-radius:5px;">
        Reset Password
      </a>
      <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
  }),

  donorInterest: (orphanageName, donorName, needTitle, note) => ({
    subject: `A donor wants to help: "${needTitle}"`,
    html: `
      <h2>Good news, ${orphanageName}!</h2>
      <p><strong>${donorName}</strong> has expressed interest in your need: <em>"${needTitle}"</em></p>
      ${note ? `<p>Their message: "${note}"</p>` : ''}
      <p>Log in to NeedsLink to view their contact details and respond.</p>
      <a href="${process.env.CLIENT_URL}/dashboard" style="padding:10px 20px;background:#2E74B5;color:#fff;text-decoration:none;border-radius:5px;">
        View Dashboard
      </a>
    `,
  }),

  newNeedNotification: (donorName, orphanageName, needTitle) => ({
    subject: `${orphanageName} posted a new need`,
    html: `
      <h2>Hi ${donorName},</h2>
      <p>An orphanage you follow — <strong>${orphanageName}</strong> — just posted a new need:</p>
      <p><em>"${needTitle}"</em></p>
      <a href="${process.env.CLIENT_URL}/orphanages" style="padding:10px 20px;background:#2E74B5;color:#fff;text-decoration:none;border-radius:5px;">
        View on NeedsLink
      </a>
    `,
  }),
};

module.exports = { sendMail, emailTemplates };
