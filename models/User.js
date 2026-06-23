const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, enum: ['DONOR', 'BENEFICIARY', 'ADMIN'], default: 'DONOR' },
  mobileNumber: { type: String, required: false, trim: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String }
}, { timestamps: true });

const UserSchema = mongoose.model('User', UserSchema);
export default UserSchema;