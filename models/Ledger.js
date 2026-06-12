const mongoose = require('mongoose');

// Define the schema using the variable name 'ledgerSchema'
const ledgerSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  actionType: { 
    type: String, 
    enum: ['RECEIVED', 'SPENT'], 
    required: true 
  },
  target: { type: String, required: true },
  amount: { type: Number, required: true },
  transactionId: { type: String, required: true }
});

// Export using the SAME variable name 'ledgerSchema'
module.exports = mongoose.model('Ledger', ledgerSchema);