const isAuthenticated = (req, res, next) => {
  if (req.user && req.user.userId) {
    return next();
  }
  res.redirect('/login');
};

module.exports = { isAuthenticated };
