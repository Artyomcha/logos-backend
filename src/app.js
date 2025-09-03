const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const { securityMonitoring, fileUploadMonitoring, rateLimitMonitoring } = require('./middleware/securityMonitoring');
require('dotenv').config();
const path = require('path');



const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const reportsRoutes = require('./routes/reports');
const companyRoutes = require('./routes/company');
const companyDatabaseRoutes = require('./routes/companyDatabase');
const companyDataRoutes = require('./routes/companyData');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const analyticsRoutes = require('./routes/analytics');
const employeeStatsRoutes = require('./routes/employeeStats');
const employeeRoutes = require('./routes/employee');
const apiKeysRoutes = require('./routes/apiKeys');
const trainingRoutes = require('./routes/training');
const DatabaseService = require('./services/databaseService');

const app = express();
// Trust proxy для Railway - используем более безопасную настройку
app.set('trust proxy', 1);

// Helmet (базовые заголовки безопасности)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS (ограничьте origin) - применяем ко всем запросам
const allowedOrigins = [
    'https://logos-tech.ru',
    'https://www.logos-tech.ru',
    'http://localhost:3000',
    'http:/45.130.213.56:3000'
    // Добавьте другие продакшен домены если нужно
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-company-name','X-CSRF-Token']
}));

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(cookieParser());

// Подключаем мониторинг безопасности
app.use(securityMonitoring);
app.use(fileUploadMonitoring);
app.use(rateLimitMonitoring);

// Глобальный rate limit (на все API)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// Убираем rate limiter для auth маршрутов, чтобы не блокировать SMTP

// Лимит на загрузку файлов (чтобы не DDOS-ить I/O)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30
});
app.use('/api/upload', uploadLimiter);
app.use('/api/training/upload-audio', uploadLimiter);

// CSRF защита (cookie-based) — применяем для браузерных запросов
// Для кросс-доменных запросов фронт (logos-tech.ru) → бэк: SameSite=None и Secure обязателен
const csrfProtection = csrf({
  cookie: {
    httpOnly: false, // Изменяем на false для доступа из JavaScript
    sameSite: 'none',
    secure: true,
    name: 'csrf'
  }
});

// Условный байпас CSRF для машинных клиентов (n8n, мобильные, интеграции)
function shouldBypassCsrf(req) {
  const hasBearer = Boolean(req.headers.authorization);
  const isApiKey = hasBearer && req.headers.authorization.includes('n8n_automation_key_2024_universal');
  const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
  const isUpload = req.path.startsWith('/api/upload') || req.path.startsWith('/api/training/upload-audio');
  const isCsrfTokenEndpoint = req.path === '/api/csrf-token';
  const isTrainingRoute = req.path.startsWith('/api/training/');
  const isAuthRoute = req.path.startsWith('/api/auth/');
  const isUserRoute = req.path.startsWith('/api/user/');
  // Убираем лишнее логирование

  // Браузерные формы/JSON — с CSRF; машинные интеграции или мультимедиа — без CSRF
  if (isApiKey) return true;
  if (isMultipart && isUpload) return true;
  if (isUpload && hasBearer) return true; // Добавляем байпас для всех upload операций с JWT
  if (isCsrfTokenEndpoint) return true;
  if (isAuthRoute) return true;
  if (isTrainingRoute && hasBearer) return true;
  if (isUserRoute && hasBearer) return true;
  
  return false;
}

app.use((req, res, next) => {
  if (shouldBypassCsrf(req)) return next();
  return csrfProtection(req, res, next);
});

// Эндпоинт для выдачи CSRF токена фронту (должен быть доступен без CSRF)
app.get('/api/csrf-token', (req, res) => {
  return csrfProtection(req, res, (err) => {
    if (err) {
      return res.status(403).json({ 
        message: 'Ошибка получения CSRF токена',
        error: 'CSRF_ERROR'
      });
    }
    
    const token = req.csrfToken();
    return res.json({ csrfToken: token });
  });
});



// Обработка ошибок CSRF
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    console.error('CSRF token error for:', req.method, req.path, {
      headers: req.headers,
      body: req.body
    });
    return res.status(403).json({ 
      message: 'CSRF токен недействителен или отсутствует',
      error: 'CSRF_ERROR'
    });
  }
  next(err);
});

// Serve company-specific static files with proper routing
app.use('/uploads/companies/:company/avatars', (req, res, next) => {
  const companyName = req.params.company;
  // Используем Railway volume path для постоянного хранения
  const filePath = path.join('/app/uploads/companies', companyName, 'avatars');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

app.use('/uploads/companies/:company/reports', (req, res, next) => {
  const companyName = req.params.company;
  // Используем Railway volume path для постоянного хранения
  const filePath = path.join('/app/uploads/companies', companyName, 'reports');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

app.use('/uploads/companies/:company/files', (req, res, next) => {
  const companyName = req.params.company;
  // Используем Railway volume path для постоянного хранения
  const filePath = path.join('/app/uploads/companies', companyName, 'files');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

app.use('/uploads/companies/:company/calls', (req, res, next) => {
  const companyName = req.params.company;
  // Используем Railway volume path для постоянного хранения
  const filePath = path.join('/app/uploads/companies', companyName, 'calls');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

app.use('/uploads/companies/:company/training', (req, res, next) => {
  const companyName = req.params.company;
  // Используем Railway volume path для постоянного хранения
  const filePath = path.join('/app/uploads/companies', companyName, 'training');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

// Legacy static file serving (for backward compatibility)
app.use('/uploads', express.static('/app/uploads'));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/company-database', companyDatabaseRoutes);
app.use('/api/company-data', companyDataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/employee-stats', employeeStatsRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/keys', apiKeysRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api');

// Get all companies
app.get('/api/companies', async (req, res) => {
  try {
    const companies = await DatabaseService.getAllCompanies();
    res.json(companies);
  } catch (error) {
    console.error('Error getting companies:', error);
    res.status(500).json({ message: 'Ошибка при получении списка компаний' });
  }
});

// Create a new company database
app.post('/api/companies', async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName) {
      return res.status(400).json({ message: 'Название компании обязательно' });
    }
    
    const dbName = await DatabaseService.createCompanyDatabase(companyName);
    res.json({ message: 'Компания создана', databaseName: dbName });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ message: 'Ошибка при создании компании' });
  }
});

app.get('/', (req, res) => {
  res.send('Logos AI backend is running');
});

// Тестовый endpoint для проверки SendGrid
app.get('/test-sendgrid', async (req, res) => {
  try {
    const { send2FACode, verifySendGridConnection } = require('./services/email');
    console.log('Testing SendGrid connection...');
    
    // Сначала проверяем конфигурацию
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ 
        message: 'SendGrid API key not configured',
        error: 'SENDGRID_NOT_CONFIGURED'
      });
    }
    
    // Тестируем отправку
    await send2FACode('artyomswim@gmail.com', '123456');
    res.json({ message: 'SendGrid test successful' });
  } catch (error) {
    console.error('SendGrid test failed:', error);
    res.status(500).json({ 
      message: 'SendGrid test failed', 
      error: error.message,
      details: error.response?.body || null
    });
  }
});

// Новый endpoint для подробной диагностики SendGrid
app.get('/test-sendgrid-details', async (req, res) => {
  try {
    const sgMail = require('@sendgrid/mail');
    
    console.log('=== DETAILED SENDGRID TEST ===');
    console.log('API Key length:', process.env.SENDGRID_API_KEY?.length || 0);
    console.log('From Email:', process.env.SENDGRID_FROM_EMAIL);
    console.log('To Email: artyomswim@gmail.com');
    
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to: 'artyomswim@gmail.com',
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'SendGrid Test - ' + new Date().toISOString(),
      text: 'This is a test email from SendGrid API',
      html: '<h1>SendGrid Test</h1><p>This is a test email sent at: ' + new Date().toISOString() + '</p>',
    };
    
    console.log('Sending message:', JSON.stringify(msg, null, 2));
    
    const result = await sgMail.send(msg);
    console.log('SendGrid result:', JSON.stringify(result, null, 2));
    
    res.json({ 
      message: 'Detailed SendGrid test successful',
      result: result,
      config: {
        apiKeyLength: process.env.SENDGRID_API_KEY?.length || 0,
        fromEmail: process.env.SENDGRID_FROM_EMAIL,
        toEmail: 'artyomswim@gmail.com'
      }
    });
  } catch (error) {
    console.error('Detailed SendGrid test failed:', error);
    res.status(500).json({ 
      message: 'Detailed SendGrid test failed', 
      error: error.message,
      response: error.response?.body || null,
      statusCode: error.code
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await DatabaseService.closeAllConnections();
  process.exit(0);
});