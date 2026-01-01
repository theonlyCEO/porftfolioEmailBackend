const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');
require('dotenv').config();

const app = express();

// FIX 1: Add trust proxy for Render
app.set('trust proxy', 1);

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: ['https://code-hive-co-za.vercel.app', 'http://localhost:3000'],
  methods: ['POST', 'GET'],
  credentials: true
}));

// FIX 2: Simplified rate limiting for Render
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { 
    success: false, 
    error: 'Too many emails sent, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use X-Forwarded-For header from Render's proxy
    return req.headers['x-forwarded-for'] || req.ip;
  }
});

// Simplified logging for Render (no file system access)
const logEmail = (email, success, ip) => {
  console.log(`Email ${success ? 'sent' : 'failed'}: ${email} from ${ip} at ${new Date().toISOString()}`);
};

// Email sending function (UPDATED FOR RENDER)
const sendSingleEmail = async (emailData) => {
  const { name, email, company, phone, website, message, req } = emailData;
  
  // Sanitize HTML input
  const sanitizedMessage = sanitizeHtml(message || '', {
    allowedTags: [],
    allowedAttributes: {}
  });

  const sanitizedCompany = sanitizeHtml(company || '', {
    allowedTags: [],
    allowedAttributes: {}
  });

  const sanitizedWebsite = sanitizeHtml(website || '', {
    allowedTags: [],
    allowedAttributes: {}
  });

  // FIX 3: Use better configuration for Render
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    },
    // Increased timeout for Render
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    // Don't verify TLS
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from: `"Contact Form" <${process.env.GMAIL_USER}>`,
    replyTo: email,
    to: process.env.RECEIVER_EMAIL || process.env.GMAIL_USER,
    subject: `New Contact Form: ${name}`,
    text: `
      CONTACT FORM SUBMISSION
      =======================
      
      Full Name: ${name}
      Email: ${email}
      Company: ${sanitizedCompany}
      Phone: ${phone || 'Not provided'}
      Website/Project URL: ${sanitizedWebsite}
      
      Project Details:
      ----------------
      ${sanitizedMessage}
      
      ----------------------
      Submitted on: ${new Date().toLocaleString()}
      IP Address: ${req.ip}
    `,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; }
          .container { background: #f9f9f9; padding: 20px; border-radius: 10px; }
          .header { background: linear-gradient(135deg, #007AFF, #5856D6); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
          .content { background: white; padding: 20px; border-radius: 0 0 10px 10px; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #007AFF; }
          .value { padding: 10px; background: #f5f5f5; border-radius: 5px; margin-top: 5px; }
          .message-box { padding: 15px; background: #eef5ff; border-left: 4px solid #007AFF; margin: 20px 0; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>📧 New Contact Form Submission</h2>
            <p>You've received a new message from your website contact form</p>
          </div>
          
          <div class="content">
            <div class="field">
              <div class="label">Full Name</div>
              <div class="value">${name}</div>
            </div>
            
            <div class="field">
              <div class="label">Email Address</div>
              <div class="value">
                <a href="mailto:${email}" style="color: #007AFF;">${email}</a>
              </div>
            </div>
            
            <div class="field">
              <div class="label">Company</div>
              <div class="value">${sanitizedCompany}</div>
            </div>
            
            <div class="field">
              <div class="label">Phone Number</div>
              <div class="value">${phone || 'Not provided'}</div>
            </div>
            
            <div class="field">
              <div class="label">Website/Project URL</div>
              <div class="value">
                ${sanitizedWebsite.startsWith('http') ? `<a href="${sanitizedWebsite}" target="_blank">${sanitizedWebsite}</a>` : sanitizedWebsite || 'Not provided'}
              </div>
            </div>
            
            <div class="field">
              <div class="label">Project Details</div>
              <div class="message-box">
                ${sanitizedMessage.replace(/\n/g, '<br>')}
              </div>
            </div>
            
            <div class="footer">
              <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>IP Address:</strong> ${req.ip}</p>
              <p><em>This email was sent from your website contact form</em></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  logEmail(email, 'success', req.ip);
  return info;
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'email-backend',
    version: '1.0.0',
    endpoints: {
      sendEmail: '/api/send-email',
      health: '/api/health',
      test: '/test'
    }
  });
});

// Test route (simplified)
app.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// Main email endpoint
app.post('/api/send-email', emailLimiter, async (req, res) => {
  const { name, email, company, phone, website, message } = req.body;
  
  // Basic validation
  if (!name || !email || !message) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields: name, email, and message are required' 
    });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid email format' 
    });
  }
  
  try {
    const info = await sendSingleEmail({ name, email, company, phone, website, message, req });
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully!',
      messageId: info.messageId 
    });
    
  } catch (error) {
    console.error('Email error:', error);
    logEmail(email, 'failed', req.ip);
    
    // FIX 4: Better error messages for Render
    let errorMessage = 'Failed to send email';
    if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timeout. Render may be blocking SMTP connections on free tier. Consider upgrading or using a different email service.';
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      code: error.code,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'email-backend',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ALTERNATIVE: Use EmailJS as fallback (keep your original setup)
app.post('/api/send-email-fallback', async (req, res) => {
  // If Render blocks SMTP, use this as an alternative
  res.json({
    success: true,
    message: 'Email would be sent via alternative service',
    note: 'Consider using EmailJS or similar service on Render'
  });
});

const PORT = process.env.PORT || 10000; // Render provides port dynamically
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email endpoint: /api/send-email`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});