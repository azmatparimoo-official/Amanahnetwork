const mongoose = require('mongoose');
const DisbursementSchema = new mongoose.Schema({
  beneficiaryEmail: { type: String, required: true, lowercase: true },
  projectTitle: { type: String, required: true, trim: true },
  amountRequested: { type: Number, required: true, min: [1, 'Must request at least $1'] },
  // ◄ NEW: Query description field for validation justification
  justificationQuery: { type: String, required: true, trim: true }, 
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  approvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Disbursement', DisbursementSchema);