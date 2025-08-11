const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { apiKeyAuthMiddleware } = require('../middleware/apiKeyAuth');

// Получить информацию о постоянном API ключе
router.get('/info', auth, async (req, res) => {
  try {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Доступ запрещен' });
    }

    res.json({
      message: 'Универсальный API ключ для автоматизации',
      api_key: 'n8n_automation_key_2024_universal',
      description: 'Универсальный ключ для n8n автоматизации (работает со всеми компаниями)',
      usage: 'Используйте заголовок X-API-Key или Authorization: Bearer',
      note: 'Обязательно указывайте название компании через заголовок X-Company-Name или query параметр companyName'
    });
  } catch (error) {
    console.error('Error getting API key info:', error);
    res.status(500).json({ message: 'Ошибка получения информации об API ключе' });
  }
});

// Тестовый endpoint для проверки API ключа
router.get('/test', apiKeyAuthMiddleware, async (req, res) => {
  res.json({
    message: 'API ключ работает',
    company_name: req.user.companyName,
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 