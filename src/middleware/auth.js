const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  console.log('Auth middleware called for:', req.method, req.path);
  const authHeader = req.headers.authorization;
  console.log('Auth header:', authHeader ? 'present' : 'missing');
  
  if (!authHeader) {
    console.log('No auth header found');
    return res.status(401).json({ message: 'Нет токена' });
  }
  
  const token = authHeader.split(' ')[1];
  console.log('Token extracted:', token ? 'present' : 'missing');
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token verified, user:', payload);
    req.user = payload;
    next();
  } catch (e) {
    console.log('Token verification failed:', e.message);
    return res.status(401).json({ message: 'Неверный токен' });
  }
}

module.exports = authMiddleware; 