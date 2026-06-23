import mongoose from 'mongoose'; // Use ES Module import
const DonationSchema = new mongoose.Schema({
  donorEmail: { type: String, required: true, lowercase: true },
  donorName: { type: String, required: true },
  mobileNumber: { type: String, required: true },
  amount: { type: Number, required: true, min: [1, 'Donation must be at least 1'] },
  projectTitle: { type: String, required: true },
  orderId: { type: String, required: true },
  paymentId: { type: String, required: true },
  status: { type: String, required: true, default: 'PENDING' },
  currency: { type: String, default: 'INR' }
}, { timestamps: true });

const Donation = mongoose.model('Donation', DonationSchema);
export default DonationSchema;
