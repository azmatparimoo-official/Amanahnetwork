const mongoose = require('mongoose');
const DonationSchema = new mongoose.Schema({
  donorEmail: { type: String, required: true, lowercase: true },
  donorName: { type: String, required: true },
  amount: { type: Number, required: true, min: [1, 'Donation must be at least $1'] },
  currency: { type: String, default: 'USD' }
}, { timestamps: true });

module.exports = mongoose.model('Donation', DonationSchema);