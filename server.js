const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: 'https://code-hive-co-za.vercel.app',
  methods: ['POST', 'GET'],
  credentials: true
}));

// Rate Limiting
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { 
    success: false, 
    error: 'Too many emails sent from this IP, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Logging function
const logEmail = (email, success, ip) => {
  const log = `${new Date().toISOString()} | ${email} | ${success} | ${ip}\n`;
  try {
    fs.appendFileSync('email-logs.csv', log);
  } catch (error) {
    console.error('Failed to write log:', error);
  }
};

// Initialize log file if it doesn't exist
try {
  if (!fs.existsSync('email-logs.csv')) {
    fs.writeFileSync('email-logs.csv', 'timestamp,email,success,ip\n');
  }
} catch (error) {
  console.error('Failed to create log file:', error);
}

// Queue system (optional, for future scaling)
const emailQueue = [];
let isProcessingQueue = false;

const processEmailQueue = async () => {
  if (isProcessingQueue || emailQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (emailQueue.length > 0) {
    const emailData = emailQueue.shift();
    try {
      await sendSingleEmail(emailData);
      // Delay between emails to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Failed to send queued email:', error);
      // Optional: retry logic here
    }
  }
  
  isProcessingQueue = false;
};

// Email sending function
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

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    },
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
  res.send('Email Backend is running!');
});

// Test email route
app.get('/test', async (req, res) => {
  try {
    const testTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    
    await testTransporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject: 'Backend Test - Success!',
      text: 'Your email backend is working correctly!'
    });
    
    res.json({ success: true, message: 'Test email sent!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Usage statistics endpoint
app.get('/api/usage', (req, res) => {
  try {
    if (!fs.existsSync('email-logs.csv')) {
      return res.json({
        today: 0,
        limit: 500,
        remaining: 500,
        percentage: '0%',
        total: 0
      });
    }

    const logContent = fs.readFileSync('email-logs.csv', 'utf8');
    const lines = logContent.trim().split('\n');
    
    // Skip header if present
    const startIndex = lines[0].includes('timestamp') ? 1 : 0;
    const today = new Date().toISOString().split('T')[0];
    
    let todayCount = 0;
    const allEmails = [];
    
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i].trim()) {
        const parts = lines[i].split(' | ');
        if (parts.length >= 2) {
          const timestamp = parts[0];
          if (timestamp.includes(today)) {
            todayCount++;
          }
          allEmails.push(parts[1]); // email address
        }
      }
    }
    
    const uniqueEmails = [...new Set(allEmails)];
    
    res.json({
      today: todayCount,
      limit: 500,
      remaining: 500 - todayCount,
      percentage: ((todayCount / 500) * 100).toFixed(1) + '%',
      total: lines.length - startIndex,
      uniqueContacts: uniqueEmails.length
    });
  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

// Main email endpoint with rate limiting
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
    // Option 1: Send immediately (current approach)
    const info = await sendSingleEmail({ name, email, company, phone, website, message, req });
    
    // Option 2: Queue for future (uncomment if needed)
    // emailQueue.push({ name, email, company, phone, website, message, req });
    // processEmailQueue();
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully!',
      messageId: info.messageId 
    });
    
  } catch (error) {
    console.error('Email error:', error);
    logEmail(email, 'failed', req.ip);
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send email',
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
    memory: process.memoryUsage()
  });
});

// Admin endpoint to clear logs (optional, for testing)
app.delete('/api/logs', (req, res) => {
  try {
    if (fs.existsSync('email-logs.csv')) {
      fs.unlinkSync('email-logs.csv');
      res.json({ success: true, message: 'Logs cleared' });
    } else {
      res.json({ success: false, message: 'No logs file found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Email endpoint: http://localhost:${PORT}/api/send-email`);
  console.log(`📊 Usage stats: http://localhost:${PORT}/api/usage`);
  console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔒 Rate limit: 5 emails per 15 minutes per IP`);
});