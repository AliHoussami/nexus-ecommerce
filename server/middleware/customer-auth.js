function requireCustomerAuth(req, res, next) {
  if (!req.session.customerId) {
    return res.status(401).json({ error: 'Please log in to continue' });
  }
  next();
}

module.exports = { requireCustomerAuth };
