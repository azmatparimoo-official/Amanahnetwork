require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const axios = require('axios');
const adminAuth = require('../middleware/adminAuth');
const isAdmin = require('../middleware/adminAuth');
const Ledger = require('../models/Ledger');
const { Resend } = require('resend');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const helmet = require('helmet'); // New: Add 'helmet' for security headers
const { body, validationResult } = require('express-validator');
// Import Schemas
const User = require('../models/User');
const Donation = require('../models/Donation');
const TransferAid = require('../models/TransferAid');
const bcrypt = require('bcryptjs');
const AuthorizedAgent = require('../models/AuthorizedAgent');
const otpStore = {};
const app = express();
let isConnected = false;
// Add this helper function at the top of your file
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(process.env.MONGO_URI);
};
app.use(cors({
  origin: process.env.CLIENT_URL, // Replace with your live Vercel frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS'],
  credentials: true
}));
app.use(helmet()); // Apply security headers
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); // Limit JSON payload size

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
 // Middleware for every sensitive API route
const secureApiGuard = (req, res, next) => {
  const secretKey = req.headers['x-governance-key'];
  if (secretKey === process.env.ADMIN_KEY) {
    return next();
  }
  res.status(403).json({ error: "Access Denied" });
};
// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 , socketTimeoutMS: 45000 })
  .then(() => console.log("🚀 Connected to MongoDB Atlas"))
  .catch(err => console.error("--- DATABASE CONNECTION FAILURE ---", err.message));

// --- MAIL TRANSPORTER SETUP ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email Transporter Error:", error);
  } else {
    console.log("✅ Email Transporter is ready to send messages");
  }
});
const session = await mongoose.startSession();
session.startTransaction();
try {
  await newDonation.save({ session });
  await createLedgerEntry('RECEIVED', donorName, amount, razorpay_payment_id, session);
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
// --- ADMIN ROUTES ---
// --- ADMIN ROUTES ---
// Tailored line 43: Using an anonymous function wrapper to prevent the "handler" error
app.post('/api/admin/create-member', (req, res, next) => {
  // This wrapper ensures we call your middleware correctly
  if (typeof isAdmin === 'function') return isAdmin(req, res, next);
  next(); // Fallback if middleware isn't loaded yet
}, async (req, res) => {
  try {
    const newAdmin = new User({ ...req.body, role: 'ADMIN', isVerified: false });
    await newAdmin.save();
    res.status(201).json({ message: "Admin member created successfully." });
  } catch (error) {
    res.status(400).json({ error: "Failed to create admin member." });
  }
});

// --- AUTH & REGISTRATION ---
// --- AUTHENTICATION ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Basic validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // 2. Fetch User
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // 3. Verify Identity AND Password
    // bcrypt.compare safely compares the input against the stored hash
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }

    // 4. Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // 5. Set HttpOnly Cookie
    res.cookie('token', token, {
      httpOnly: true, // Prevents XSS-based token theft
      secure: process.env.NODE_ENV === 'production', // Use true for HTTPS
      sameSite: 'strict', // Protects against CSRF
      maxAge: 3600000 // 1 hour
    });

    res.status(200).json({ message: "Logged in successfully" });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal Auth Error." });
  }
});
//registration
app.post('/api/register', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    const token = crypto.randomBytes(32).toString('hex');
    const newUser = new User({ ...req.body, verificationToken: token, isVerified: true});
    await newUser.save();
    await transporter.sendMail({
      from: '"Amanah Support" <amanahnetwork.official@gmail.com>',
      to: req.body.email,
      subject: 'THANKS FOR REGISTERING WITH AMANAH',
      text: `We are thrilled to welcome you to the Amanah Network! Your account has been created successfully. \nThank you for joining us in making a difference!`,
    });
    res.status(201).json({ message: "Registration successful! Please check your email." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/verify/:token', async (req, res) => {
  const user = await User.findOneAndUpdate({ verificationToken: req.params.token }, { isVerified: true, verificationToken: undefined });
  if (!user) return res.status(400).send("Invalid or expired token.");
  res.send("<h1>Account Verified!</h1>");
});

// --- PAYMENT INTEGRATION ---
app.post('/api/payment/create-order', async (req, res) => {
  const { amount, donorEmail, projectTitle , donorName , mobileNumber  } = req.body;
  // Validation: Prevent empty requests from crashing the server
  if (!amount || !donorEmail || !donorName || !mobileNumber) {
    return res.status(400).json({ error: "Missing required donation details" });
  }

  try {
    // 1. Ensure DB connection is established
    await connectDB(); 
  const userExists = await User.findOne({ email: donorEmail.toLowerCase() });
    if (!userExists) {
      return res.status(401).json({ error: "Access Denied: Email not registered in our network." });
    }
    // 2. Create Razorpay Order
    const order = await razorpay.orders.create({ 
        amount: amount * 100, 
        currency: "INR", 
        receipt: `receipt_${Date.now()}` 
    });
    res.status(200).json(order);
  } catch (error) {
    // Log the actual error for Vercel Logs
    console.error("Payment Creation Error:", error);
    res.status(500).json({ error: error.message || "Failed to create order" });
  }
});
console.log("Payment route set up successfully.");
// email
 const resend = new Resend(process.env.RESEND_API_KEY);

const sendDonationEmail = async (donorEmail, amount) => {
  try {
    await resend.emails.send({
      from: 'Amanah Foundation <onboarding@resend.dev>', // Verified domain later
      to: 'networkamanah60@gmail.com',
      subject: 'Donation Received!',
      html: `<h1>Thank you!</h1><p>We received your donation of ₹${amount}.</p>`
    });
  } catch (err) {
    console.error("Resend Error:", err);
  }
};

// Ensure you have 'let isConnected = false;' defined at the top level of your server.js
app.post("/api/payment/verify", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1. Database Connection Caching
    if (!isConnected) {
      await mongoose.connect(process.env.MONGO_URI);
      isConnected = true;
    }
    // 2. Extract Data
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      donorEmail, 
      amount, 
      donorName, 
      mobileNumber, 
      projectTitle 
    } = req.body;

    // 3. Verify Signature
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    
    if (hmac.digest("hex") !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // 3. Prevent Duplicates (Security Check)
    const existing = await Donation.findOne({ paymentId: razorpay_payment_id });
    if (existing) {
      return res.status(400).json({ error: "Payment already processed" });
    }

    // 4. Verify with Razorpay API
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    
    if (payment.status === 'captured') {
        // 5. Save to Database
        const newDonation = new Donation({ 
        donorEmail, 
        donorName,
        mobileNumber, 
        amount, 
        projectTitle, 
        orderId:razorpay_order_id, 
        paymentId:razorpay_payment_id, 
        status: "SUCCESS" 
        });
       
        await newDonation.save({session});
        await createLedgerEntry('RECEIVED', donorName, amount, razorpay_payment_id,session);
        await session.commitTransaction();
        sendDonationEmail(donorEmail, amount);
        
        return res.status(200).json({ status: "success", message: "Donation verified." });
    } else {
        await session.abortTransaction();
        return res.status(400).json({ error: "Payment not captured" });
    }
  } catch (error) {
    // If anything fails, undo all changes
    await session.abortTransaction();
    console.error("Transaction Aborted:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    session.endSession();
  }
});
  app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;
  await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject: 'Your OTP', text: `Code: ${otp}` });
  res.json({ message: "OTP Sent" });
});

app.post('/api/auth/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (otpStore[email] === otp) {
        otpStore[email] = { verified: true }; // Store a status, not just the code
        return res.json({ verified: true });
    }
    res.status(400).json({ error: "Invalid OTP" });
});
app.get('/api/auth/digilocker', (req, res) => {
  const authUrl = `https://api.digitallocker.gov.in/authorize?client_id=${process.env.DL_ID}&response_type=code`;
  res.redirect(authUrl);
});

// Step 2: Handle callback
app.get('/api/auth/digilocker/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    // 1. Exchange code for access_token
    const tokenResponse = await axios.post('https://api.digitallocker.gov.in/token', {
      client_id: process.env.DL_ID,
      client_secret: process.env.DL_SECRET, // You need this!
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.DL_REDIRECT_URI
    });

    // 2. Fetch User Profile
    const profile = await axios.get('https://api.digitallocker.gov.in/user', {
      headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
    });

    // 3. Extract KYC info and redirect to frontend with success
    // profile.data contains Aadhaar name, etc.
    res.redirect(`${process.env.CLIENT_URL}/enrollment?kycSuccess=true&name=${profile.data.name}`);
    
  } catch (error) {
    res.redirect(`${process.env.CLIENT_URL}/enrollment?kycSuccess=false`);
  }
});
app.post('/api/admin/enroll-agent', 
  [body('email').isEmail().normalizeEmail(),
  body('name').trim().escape()],
  async (req, res) => {
    const errors = validationResult(req);
  if (!errors.isEmpty())
   return res.status(400).json({ errors: errors.array() });
  const { name, email, password, kyc, secretKey } = req.body;

  // 1. Verify Governance Key
  if (secretKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: "Unauthorized: Invalid Governance Key" });
  }
  if (!otpStore[req.body.email]?.verified) {
    return res.status(401).json({ error: "Email not verified via OTP" });
}
  try {
    // 2. Create the Agent
    const newAgent = new AuthorizedAgent({
      name,
      email,
      password,
      kyc
    });

    await newAgent.save();
    res.status(201).json({ message: "Agent enrolled successfully." });
  } catch (error) {
    console.error("Enrollment Error:", error);
    res.status(400).json({ error: "Enrollment failed. Email might already exist." });
  }
});

async function verifyBankAccount(accountNumber, ifsc) {
  try {
    // Razorpay's Account Verification API
    const response = await razorpay.accounts.validate({
      account_number: accountNumber,
      ifsc: ifsc,
      name: "Beneficiary Name" // Ideally, pass the recipient's name here
    });
    
    // Return true if verification is successful
    return response.status === 'active';
  } catch (error) {
    console.error("Razorpay Verification Failed:", error);
    return false;
  }
} 
// Add this to your server file
app.post('/api/verify-bank', async (req, res) => {
        
  console.log("Razorpay Key:", process.env.RAZORPAY_KEY_ID ? "Exists" : "MISSING");

  const { accountNumber, ifsc } = req.body;

  if (process.env.MOCK_BANK_VERIFICATION === 'true') {
    console.log("Mocking bank verification for account:", accountNumber);
    return res.status(200).json({ valid: true });
  }

  try {
    const verification = await razorpay.accounts.validate({
      account_number: transferData.accountNumber,
      ifsc: transferData.ifscCode,
      name: transferData.orgName
    });

    if (verification.status === 'active') {
      res.status(200).json({ valid: true });
    } else {
      res.status(400).json({ valid: false });
    }
  } catch (error) {
    res.status(500).json({ error: "Verification service unavailable" });
  }
});
const transferLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message: "Too many transfer attempts, please try again later."
});
app.use(process.env.SECRET_TRANSFER_PATH, transferLimiter);
app.post(process.env.SECRET_TRANSFER_PATH,
  [
    body('email').isEmail().normalizeEmail(),
  body('transferData.accountNumber').isLength({ min: 9, max: 18 }).isNumeric(),
  body('transferData.ifscCode').isLength({ min: 11, max: 11 }).trim().escape(),
  body('transferData.orgName').trim().escape(),
  body('transferData.amount').isNumeric().toFloat()
  ],
   async (req, res) => {
    const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  const { email, password, transferData } = req.body;

  try {
    // 1. Verify Agent
   /* const agent = await AuthorizedAgent.findOne({ email });
    if (!agent || !(await bcrypt.compare(password, agent.password))) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }
*/
    // 2. Bank Verification (Razorpay)
    const verification = await razorpay.accounts.validate({
      account_number: transferData.accountNumber,
      ifsc: transferData.ifscCode,
      name: transferData.orgName
    });
    if (verification.status !== 'active') {
      return res.status(400).json({ error: "Bank account verification failed. Please check details." });
    }

    // 3. Save to Database
    const newTransfer = new TransferAid({
      ...transferData,
      agentId: 123456789,
      senderEmail: email || "networkamanah60@gmail.com"
    });
    
    await newTransfer.save({session});
    await createLedgerEntry('SPENT', transferData.orgName, transferData.amount, newTransfer._id, session);
    await session.commitTransaction();

    // 4. Send Email Notification
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: transferData.email,
      subject: "Donation Disbursement Confirmation",
      text: `Hello ${transferData.orgName}, your donation of ₹${transferData.amount} has been successfully processed and sent to your account.`
    });

    res.status(200).json({ message: "Payment Successful", transactionId: newTransfer._id });

  } catch (error){ // 5. Rollback on any failure
    console.error("Transfer Transaction Aborted:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});
app.post('/api/admin/verify-vault', (req, res) => {
  const { key } = req.body;
  if (key === process.env.VISION_PATH) {
    // We can even set a short-lived "vault-access" cookie here
    return res.status(200).json({ unlocked: true });
  }
  res.status(403).json({ error: "Invalid Governance Key" });
});
// Add this route to server.js
app.get('/api/admin/check-access', adminAuth, (req, res) => {
  // adminAuth middleware already verified the JWT and user role.
  // If we reach this line, the user is authorized.
  res.status(200).json({ authorized: true });
});
// Ensure this is ABOVE your app.listen or export
app.get('/api/admin/ledger', adminAuth, async (req, res) => {
  try {
  await connectDB(); // Ensure DB connection before querying
  const { from, to,actionType } = req.query;
    const query = {};
    if (from && to && from !== 'undefined' && to !== 'undefined') {
      const startDate = new Date(from);
      const endDate = new Date(to);
      // Ensure we include the full duration of the 'to' day
     if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        endDate.setUTCHours(23, 59, 59, 999);
        query.timestamp = { $gte: startDate, $lte: endDate };
      }
    }
    if (actionType && actionType !== 'ALL' && actionType !== 'undefined') {
      query.actionType = { $regex:new RegExp(actionType, 'i') };
    } else {
  // If actionType is 'ALL' or empty, we explicitly ensure the query 
  // does NOT contain actionType, so it returns all records.
  delete query.actionType;
}
    console.log("DEBUG: Database Query:", JSON.stringify(query));

    const ledgerEntries = await Ledger.find(query).sort({ timestamp: -1 });
    res.status(200).json(ledgerEntries);
  } catch (error) {
    console.error("CRITICAL_LEDGER_ERROR:", error);
    res.status(500).json({ message: "Error fetching ledger", error: error.message });
  }
});
// A central helper to keep your code DRY
async function createLedgerEntry(actionType, target, amount, transactionId, session) {
  // Add this validation check
  if (!target || !amount || !transactionId) {
    console.error("Ledger Save Failed: Missing fields", { target, amount, transactionId });
    return;
  }
  try {
    const newEntry = new Ledger({
      actionType, // 'RECEIVED' or 'SPENT'
      target,     // e.g., 'Donor Name' or 'Project Title'
      amount,
      transactionId,
      timestamp: new Date()
    });
    return await newEntry.save({session});
    console.log("Ledger entry saved successfully");
  } catch (err) {
    console.error("Ledger Save Error:", err);
    throw err; // This helps debug exactly what field is missing
  }
}
// --- DONATIONS 
app.get('/api/donations', async (req, res) => {
  res.status(200).json(await Donation.find());
});


// --- ANALYTICS ---
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  const ledger = await Ledger.find();
  
  let received = 0;
  let spent = 0;

  ledger.forEach(entry => {
    if (entry.actionType === 'RECEIVED') received += entry.amount;
    if (entry.actionType === 'SPENT') spent += entry.amount;
  });

  res.json({
    totalDonated: received,
    totalSpent: spent,
    balance: received - spent
  });
});
app.get('/', (req, res) => {
  res.send('Amanah Network API is running. Use /api/ for endpoints.');
});
module.exports = app;