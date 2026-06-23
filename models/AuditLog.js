// models/AuditLog.js
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: String,
  agentId: mongoose.Schema.Types.ObjectId,
  ipAddress: String, // Track where the request came from
  status: String,    // 'SUCCESS' or 'FAILED'
  timestamp: { type: Date, default: Date.now }
});
const AuditlogSchema = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLogSchema;
