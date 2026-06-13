const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  // Extract headers
  const adminId = req.headers['adminid']; // Note: headers are often lowercase
  const useSecretKey = req.headers['use-secret-key'];

  // 1. Check for Master Key
  if (useSecretKey === process.env.ADMIN_KEY) {
    // Assign the ID from .env
    req.user = { _id: process.env.SYSTEM_ADMIN_ID }; 
    return next();
  }

  // 2. Check for individual Admin ID
  try {
    if (adminId) {
      const user = await User.findById(adminId);
      if (user && user.isVerified) {
        req.user = user;
        return next();
      }
    }
  } catch (err) {
    console.error("Auth Middleware Error:", err);
  }
  
  res.status(403).json({ error: "Access Denied. Verification required." });
};

module.exports = adminAuth;