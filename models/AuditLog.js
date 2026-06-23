// models/AuditLog.js
import mongoose from 'mongoose'; // Use ES Module import
const AuditLogSchema = new mongoose.Schema({
  action: String,
  agentId: mongoose.Schema.Types.ObjectId,
  ipAddress: String, // Track where the request came from
  status: String,    // 'SUCCESS' or 'FAILED'
  timestamp: { type: Date, default: Date.now }
});
const Auditlog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLogSchema;
