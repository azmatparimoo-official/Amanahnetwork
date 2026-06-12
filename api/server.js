require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const adminAuth = require('../middleware/adminAuth');
const isAdmin = require('../middleware/adminAuth');
const Ledger = require('../models/Ledger');
import { Resend } from 'resend';
// Import Schemas
const User = require('../models/User');
const Donation = require('../models/Donation');
const Disbursement = require('../models/Disbursement');
const app = express();
let isConnected = false;
// Add this helper function at the top of your file
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(process.env.MONGO_URI);
};
app.use(cors({
  origin: process.env.CLIENT_URL, // Replace with your live Vercel frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
    const { email } = req.body;
    
    // Check if DB is connected (simple ping)
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected yet. Please wait." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Access Denied. Identity not found." });
    
    res.status(200).json({ message: "Auth successful", user });
  } catch (error) {
    console.error("Login Error:", error); // This will tell us the exact line causing the 500
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
  const { amount, donorEmail, projectTitle , donorName , mobileNumber } = req.body;

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
        orderId: razorpay_order_id, 
        paymentId: razorpay_payment_id, 
        status: "SUCCESS" 
        });
        await newDonation.save();
        
        // 6. Async Email (Fire and forget)
        sendDonationEmail(donorEmail, amount);
        
        return res.status(200).json({ status: "success", message: "Donation verified and captured." });
    } else {
        return res.status(400).json({ error: "Payment not captured by provider" });
    }
  } catch (error) {
    console.error("Verification Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
// --- REFUND ROUTE ---
app.post('/api/admin/process-refund', adminAuth, async (req, res) => {
  const { donationId, amount, userEmail, userName } = req.body;
  await Donation.findByIdAndUpdate({ orderId: donationId }, { status: "REFUNDED" });

  // SAVE TO LEDGER
  await new Ledger({
    targetUserEmail: userEmail,
    targetUserName: userName,
    actionType: 'REFUND_PROCESSED',
    performedBy: req.user ? req.user._id : null, 
    details: `Refund processed`,
    amount: amount
  }).save();

  res.status(200).json({ message: "Refund logged successfully." });
});

// --- DONATIONS & DISBURSEMENTS ---
app.get('/api/donations', async (req, res) => {
  res.status(200).json(await Donation.find());
});

app.post('/api/disbursements/request', async (req, res) => {
  const { name, email, description } = req.body; 
  try {
    await new Disbursement(req.body).save();
    await transporter.sendMail({
      from: '"Amanah Support" <amanahnetwork.official@gmail.com>',
      to: email,
      subject: 'We received your aid request',
      html: `<div><h2>Request Received</h2><p>Hi ${name},</p><p>We have successfully received your request for aid.</p></div>`
    });
    res.status(201).json({ message: "Request received and email sent!" });
  } catch (error) {
    console.error("Aid Request Email Error:", error);
    res.status(500).json({ error: "Request saved, but email notification failed." });
  }
});

app.patch('/api/disbursements/approve/:id', async (req, res) => {
  const updated = await Disbursement.findByIdAndUpdate(req.params.id, { status: 'APPROVED', approvedAt: new Date() }, { new: true });
  res.status(200).json(updated);
});

app.get('/api/disbursements', async (req, res) => {
  res.status(200).json(await Disbursement.find());
});

app.post('/api/admin/answer-query', adminAuth, async (req, res) => {
  const { queryId, answer, userEmail, userName } = req.body;
  try {
    await new Ledger({
      targetUserEmail: userEmail,
      targetUserName: userName,
      actionType: 'QUERY_ANSWERED',
      performedBy: req.user ? req.user._id : null, 
      details: answer,
      amount: 0 
    }).save();
    res.status(200).json({ message: "Answered and recorded in ledger." });
  } catch (error) {
    res.status(500).json({ error: "Failed to process and log answer." });
  }
});

// --- ANALYTICS ---
app.get('/api/admin/analytics', async (req, res) => {
  const donations = await Donation.find();
  const disbursements = await Disbursement.find();
  const totalDonated = donations.reduce((sum, d) => (d.status === 'SUCCESS' ? sum + d.amount : sum), 0);
  const totalDisbursed = disbursements.reduce((sum, d) => sum + d.amount, 0);
  res.status(200).json({ totalDonated, totalDisbursed, balance: totalDonated - totalDisbursed });
});

app.get('/', (req, res) => {
  res.send('Amanah Network Backend is running!');
});
const PORT = process.env.PORT || 5000;
module.exports = app;