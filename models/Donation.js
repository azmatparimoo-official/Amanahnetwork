const mongoose = require('mongoose');

const DonationSchema = new mongoose.Schema({
  donorEmail: { type: String, required: true, lowercase: true },
  donorName: { type: String, required: true },
  mobileNumber: { type: String, required: true },
  amount: { type: Number, required: true, min: [1, 'Donation must be at least 1'] },
  projectTitle: { type: String, required: true },
  orderId: { type: String, required: true },
  status: { type: String, required: true, default: 'PENDING' },
  currency: { type: String, default: 'INR' }
}, { timestamps: true });

module.exports = mongoose.model('Donation', DonationSchema);