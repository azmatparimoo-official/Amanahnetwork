// middleware/adminAuth.js
const adminAuth = async (req, res, next) => {
  const { adminId, useSecretKey } = req.headers;

  if (useSecretKey === process.env.ADMIN_KEY) {
    return next(); // Bypass for Master Key
  }

  const user = await User.findById(adminId);
  if (user && user.isVerified) {
    req.user = user; // Attach user to request
    return next();
  }
  
  res.status(403).json({ error: "Access Denied. Verification required." });
};
module.exports = adminAuth;