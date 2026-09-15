function requireLogin(req, res, next) {
  if (!req.session || !req.session.associateId) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).render('error', { message: 'Admin access required', title: 'Forbidden' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
