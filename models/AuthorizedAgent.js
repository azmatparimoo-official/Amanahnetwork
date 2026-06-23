const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AuthorizedAgentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // KYC Details
  kyc: {
    mobileNumber: { type: String, required: true },
    aadharNumber: { type: String, required: true },
    panNumber: { type: String, required: true }
  },

  // Permissions for future expansion (e.g., ['TRANSFER', 'VIEW_LEDGER', 'MANAGE_USERS'])
  permissions: { type: [String], default: ['TRANSFER'] },
  
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
AuthorizedAgentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const AuthorizedAgent = mongoose.model('AuthorizedAgent', AuthorizedAgentSchema);
export default AuthorizedAgent;