const jwt = require('jsonwebtoken');
const { apiKeyAuthMiddleware } = require('./apiKeyAuth');

function combinedAuthMiddleware(req, res, next) {
  console.log('Combined auth middleware called for:', req.method, req.path);
  
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  
  // Если есть API ключ в заголовке X-API-Key, используем его
  if (apiKey) {
    console.log('Using X-API-Key authentication');
    return apiKeyAuthMiddleware(req, res, next);
  }
  
  // Если есть Authorization header, проверяем что это
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      console.log('No token found in Authorization header');
      return res.status(401).json({ message: 'Нет токена' });
    }
    
    // Проверяем, это API ключ или JWT токен
    if (token === 'n8n_automation_key_2024_universal') {
      console.log('Using API key authentication via Authorization header');
      return apiKeyAuthMiddleware(req, res, next);
    } else {
      // Это JWT токен
      console.log('Using JWT authentication');
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
  }
  
  // Если нет ни API ключа, ни JWT токена
  console.log('No authentication provided');
  return res.status(401).json({ message: 'Требуется аутентификация' });
}

module.exports = combinedAuthMiddleware; 