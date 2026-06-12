const mongoose = require('mongoose');
const ledgerSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  actionType: { 
    type: String, 
    enum: ['RECEIVED', 'SPENT'], // Ensure these match exactly what you pass
    required: true 
  },
  target: { type: String, required: true }, // Use 'target' instead of split email/name
  amount: { type: Number, required: true },
  transactionId: { type: String, required: true }
});
module.exports = mongoose.model('Ledger', LedgerSchema);