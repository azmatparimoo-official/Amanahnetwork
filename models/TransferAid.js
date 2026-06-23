const mongoose = require('mongoose');

const TransferAidSchema = new mongoose.Schema({
  // Receiving Org Details
  orgName: { type: String, required: true },
  address: { type: String, required: true },
  ciaNumber: { type: String, required: true },
  email: { type: String, required: true },

  // Financial Details
  amount: { type: Number, required: true },
  accountNumber: { type: String, required: true },
  ifscCode: { type: String, required: true },
  
  // Metadata
  date: { type: Date, default: Date.now },
  
  // Tracking
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthorizedAgent', required: true },
  senderEmail: { type: String, required: true }, // Captured from the server session
  authorizedAt: { type: Date, default: Date.now }
});

const TransferAidSchema = mongoose.model('TransferAid', TransferAidSchema);
export default TransferAidSchema;