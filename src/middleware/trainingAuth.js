const jwt = require('jsonwebtoken');

// Постоянный токен для автоматизации n8n (универсальный для всех компаний)
const PERMANENT_API_KEY = 'n8n_automation_key_2024_universal';

function trainingAuthMiddleware(req, res, next) {
  console.log('Training Auth middleware called for:', req.method, req.path);
  
  const authHeader = req.headers.authorization;
  console.log('Auth header:', authHeader ? 'present' : 'missing');
  
  if (!authHeader) {
    console.log('No auth header found');
    return res.status(401).json({ message: 'Нет токена' });
  }
  
  const token = authHeader.split(' ')[1];
  console.log('Token extracted:', token ? 'present' : 'missing');
  
  // Проверяем API ключ
  if (token === PERMANENT_API_KEY) {
    // Получаем название компании из заголовка
    let companyName = req.headers['x-company-name'];
    
    console.log('API key verified, company:', companyName);
    
    // Устанавливаем данные пользователя для совместимости с существующим кодом
    req.user = {
      id: 1, // ID 1 для совместимости с существующей схемой
      role: 'employee', // Роль сотрудника для доступа к обучению
      companyName: companyName,
      apiKey: true
    };
    
    next();
  } else {
    // Пробуем JWT токен
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      console.log('JWT Token verified, user:', payload);
      req.user = payload;
      next();
    } catch (e) {
      console.log('Token verification failed:', e.message);
      return res.status(401).json({ message: 'Неверный токен' });
    }
  }
}

module.exports = trainingAuthMiddleware;
