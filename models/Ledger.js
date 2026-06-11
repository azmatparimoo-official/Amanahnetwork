const mongoose = require('mongoose');

const LedgerSchema = new mongoose.Schema({
  targetUserEmail: { type: String, required: true },
  targetUserName: { type: String, required: true },
  actionType: { 
    type: String, 
    enum: ['QUERY_ANSWERED', 'REFUND_PROCESSED', 'OTHER'], 
    required: true 
  },
  performedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null // Will be null if performed via Master Secret Key
  },
  details: { type: String }, // The answer given or refund note
  amount: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ledger', LedgerSchema);