const mongoose = require('mongoose');

const TransferAidSchema = new mongoose.Schema({
  recipientName: { type: String, required: true },
  amount: { type: Number, required: true },
  note: { type: String },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transactionId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['COMPLETED', 'PENDING'], default: 'COMPLETED' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TransferAid', TransferAidSchema);