const crypto = require('crypto');

// Постоянный токен для автоматизации n8n (универсальный для всех компаний)
const PERMANENT_API_KEY = 'n8n_automation_key_2024_universal';

async function apiKeyAuthMiddleware(req, res, next) {
  console.log('API Key auth middleware called for:', req.method, req.path);
  
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    console.log('No API key found');
    return res.status(401).json({ message: 'API ключ не предоставлен' });
  }
  
  // Проверяем постоянный токен
  if (apiKey === PERMANENT_API_KEY) {
    // Получаем название компании из заголовка или query параметра (если есть)
    const companyName = req.headers['x-company-name'] || req.query.companyName;
    
    console.log('Permanent API key verified, company from header/query:', companyName);
    
    // Устанавливаем данные пользователя для совместимости с существующим кодом
    req.user = {
      id: 1, // ID 1 для совместимости с существующей схемой
      role: 'manager', // Роль менеджера для полного доступа
      companyName: companyName, // Может быть undefined
      apiKey: true
    };
    
    next();
  } else {
    console.log('Invalid API key');
    return res.status(401).json({ message: 'Неверный API ключ' });
  }
}

module.exports = { apiKeyAuthMiddleware }; 