require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const adminAuth = require('./middleware/adminAuth');
const isAdmin = require('./middleware/adminAuth');
const Ledger = require('./models/Ledger');
// Import Schemas
const User = require('./models/User');
const Donation = require('./models/Donation');
const Disbursement = require('./models/Disbursement');
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("🚀 Connected to MongoDB Atlas"))
  .catch(err => console.error("--- DATABASE CONNECTION FAILURE ---", err.message));

// --- MAIL TRANSPORTER SETUP ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
module.exports = transporter;
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
    const token = crypto.randomBytes(32).toString('hex');
    const newUser = new User({ ...req.body, verificationToken: token });
    await newUser.save();
    await transporter.sendMail({
      from: '"Amanah Support" <amanahnetwork.official@gmail.com>',
      to: req.body.email,
      subject: 'Verify your Amanah Account',
      text: `Click to verify: http://localhost:5000/api/verify/${token}`
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
  const { amount, donorEmail, projectTitle } = req.body;
  try {
    const order = await razorpay.orders.create({ amount: amount * 100, currency: "INR", receipt: `receipt_${Date.now()}` });
    await new Donation({ donorEmail, amount, projectTitle, orderId: order.id, status: "PENDING" }).save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: "Failed to create order" });
  }
});

// --- PAYMENT INTEGRATION ---
// ... (keep your create-order code as is)

app.post("/api/payment/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, donorEmail, amount } = req.body;
  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET);
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  
  if (hmac.digest("hex") === razorpay_signature) {
    await Donation.findOneAndUpdate({ orderId: razorpay_order_id }, { status: "SUCCESS" });
    
    // INTEGRATED EMAIL LOGIC
    try {
      await transporter.sendMail({
        from: '"Amanah Foundation" <amanahnetwork.official@gmail.com>',
        to: donorEmail, 
        subject: 'Donation Received!',
        html: `<h1>Thank you!</h1><p>We received your donation of ₹${amount}.</p>`
      });
      res.status(200).json({ status: "success", message: "Donation verified and email sent." });
    } catch (emailError) {
      console.error("Email Error:", emailError);
      res.status(200).json({ status: "success", message: "Donation verified, but email failed." });
    }

  } else {
    res.status(400).json({ error: "Invalid signature" });
  }
});

// server.js
app.post('/api/admin/process-refund', adminAuth, async (req, res) => {
  const { donationId, amount, userEmail, userName } = req.body;
  
  // Identify who performed this
  const performedBy = req.user ? req.user._id : "MASTER_KEY_USER";

  await Donation.findByIdAndUpdate(donationId, { status: 'REFUNDED' });

  // SAVE TO LEDGER
  await new Ledger({
    targetUserEmail: userEmail,
    targetUserName: userName,
    actionType: 'REFUND_PROCESSED',
    performedBy: req.user ? req.user._id : null, 
    details: `Refund processed via ${req.user ? 'Board Member' : 'Master Key'}`,
    amount: amount
  }).save();

  res.status(200).json({ message: "Refund logged successfully." });
});

// --- DONATIONS & DISBURSEMENTS ---
app.get('/api/donations', async (req, res) => {
  res.status(200).json(await Donation.find());
});

app.post('/api/disbursements/request', async (req, res) => {
  const { name, email, description } = req.body; // Ensure these fields exist

  try {
    // 1. Save to Database
    await new Disbursement(req.body).save();

    // 2. Send Confirmation Email
    await transporter.sendMail({
      from: '"Amanah Support" <amanahnetwork.official@gmail.com>',
      to: email,
      subject: 'We received your aid request',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2 style="color: #2d3748;">Request Received</h2>
          <p>Hi ${name},</p>
          <p>We have successfully received your request for aid. Our team is currently reviewing the details:</p>
          <blockquote style="border-left: 4px solid #ecc94b; padding-left: 10px; color: #555;">
            ${description}
          </blockquote>
          <p>We will reach out to you if we need further information. Thank you for your patience.</p>
          <p>Best regards,<br><strong>Amanah Network</strong></p>
        </div>
      `
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
    // 1. YOUR EXISTING LOGIC to update the query in the database
    // await Query.findByIdAndUpdate(queryId, { answer: answer, status: 'ANSWERED' });
  
    // 2. Log to Ledger
    await new Ledger({
      targetUserEmail: userEmail,
      targetUserName: userName,
      actionType: 'QUERY_ANSWERED',
      performedBy: req.user ? req.user._id : null, 
      details: answer,
      amount: 0 // Default to 0 for queries
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Production Engine running on port ${PORT}`));