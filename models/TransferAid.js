const mongoose = require('mongoose');

const TransferAidSchema = new mongoose.Schema({
  recipientName: { type: String, required: true },
  amount: { type: Number, required: true },
  note: { type: String },
  transactionId: { type: String, required: true, unique: true },
  
  // Now linking to the new AuthorizedAgent collection
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthorizedAgent', required: true }, 
  authorizedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TransferAid', TransferAidSchema);