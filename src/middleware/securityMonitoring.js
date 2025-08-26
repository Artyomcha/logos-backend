const fs = require('fs');
const path = require('path');

// Конфигурация мониторинга
const SECURITY_LOG_FILE = '/app/logs/security.log';
const ALERT_THRESHOLDS = {
  failedLogins: 5, // Количество неудачных попыток входа
  csrfViolations: 3, // Количество CSRF нарушений
  fileUploadErrors: 10, // Количество ошибок загрузки файлов
  rateLimitExceeded: 20 // Количество превышений rate limit
};

// Кэш для отслеживания событий
const securityEvents = {
  failedLogins: new Map(),
  csrfViolations: new Map(),
  fileUploadErrors: new Map(),
  rateLimitExceeded: new Map()
};

// Функция для записи в лог
function writeSecurityLog(level, message, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    details,
    ip: details.ip || 'unknown',
    userAgent: details.userAgent || 'unknown',
    path: details.path || 'unknown'
  };

  const logLine = JSON.stringify(logEntry) + '\n';
  
  // Создаем директорию если не существует
  const logDir = path.dirname(SECURITY_LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Записываем в файл
  fs.appendFileSync(SECURITY_LOG_FILE, logLine);
  
  // Выводим в консоль для отладки
  console.log(`[SECURITY ${level.toUpperCase()}] ${message}`, details);
}

// Функция для проверки пороговых значений
function checkThresholds(type, identifier) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 минут
  
  if (!securityEvents[type].has(identifier)) {
    securityEvents[type].set(identifier, []);
  }
  
  const events = securityEvents[type].get(identifier);
  
  // Удаляем старые события
  const recentEvents = events.filter(event => now - event < windowMs);
  securityEvents[type].set(identifier, recentEvents);
  
  // Добавляем новое событие
  recentEvents.push(now);
  
  // Проверяем порог
  if (recentEvents.length >= ALERT_THRESHOLDS[type]) {
    writeSecurityLog('ALERT', `${type} threshold exceeded`, {
      identifier,
      count: recentEvents.length,
      threshold: ALERT_THRESHOLDS[type]
    });
    return true;
  }
  
  return false;
}

// Middleware для мониторинга безопасности
function securityMonitoring(req, res, next) {
  const startTime = Date.now();
  const originalSend = res.send;
  
  // Перехватываем ответ
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Логируем подозрительную активность
    if (statusCode === 401 || statusCode === 403) {
      const identifier = req.ip || req.connection.remoteAddress;
      
      if (statusCode === 401) {
        checkThresholds('failedLogins', identifier);
        writeSecurityLog('WARN', 'Failed authentication attempt', {
          ip: identifier,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });
      }
      
      if (statusCode === 403) {
        checkThresholds('csrfViolations', identifier);
        writeSecurityLog('WARN', 'Access denied', {
          ip: identifier,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent'),
          reason: data?.error || 'unknown'
        });
      }
    }
    
    // Логируем медленные запросы
    if (duration > 5000) { // больше 5 секунд
      writeSecurityLog('WARN', 'Slow request detected', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        duration: `${duration}ms`
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
}

// Middleware для мониторинга загрузки файлов
function fileUploadMonitoring(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (req.path.includes('/upload') && res.statusCode !== 200) {
      const identifier = req.ip || req.connection.remoteAddress;
      checkThresholds('fileUploadErrors', identifier);
      
      writeSecurityLog('WARN', 'File upload error', {
        ip: identifier,
        path: req.path,
        method: req.method,
        error: data?.message || 'unknown',
        fileType: req.file?.mimetype,
        fileSize: req.file?.size
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
}

// Middleware для мониторинга rate limit
function rateLimitMonitoring(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (res.statusCode === 429) { // Too Many Requests
      const identifier = req.ip || req.connection.remoteAddress;
      checkThresholds('rateLimitExceeded', identifier);
      
      writeSecurityLog('WARN', 'Rate limit exceeded', {
        ip: identifier,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
}

// Функция для получения статистики безопасности
function getSecurityStats() {
  const stats = {};
  
  for (const [type, events] of Object.entries(securityEvents)) {
    stats[type] = {
      totalEvents: 0,
      uniqueIdentifiers: 0,
      recentActivity: 0
    };
    
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 минут
    
    for (const [identifier, eventList] of events) {
      stats[type].totalEvents += eventList.length;
      stats[type].uniqueIdentifiers++;
      
      const recentEvents = eventList.filter(event => now - event < windowMs);
      stats[type].recentActivity += recentEvents.length;
    }
  }
  
  return stats;
}

// Функция для очистки старых событий
function cleanupOldEvents() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 часа
  
  for (const [type, events] of Object.entries(securityEvents)) {
    for (const [identifier, eventList] of events) {
      const recentEvents = eventList.filter(event => now - event < maxAge);
      if (recentEvents.length === 0) {
        events.delete(identifier);
      } else {
        events.set(identifier, recentEvents);
      }
    }
  }
}

// Очистка старых событий каждые 6 часов
setInterval(cleanupOldEvents, 6 * 60 * 60 * 1000);

module.exports = {
  securityMonitoring,
  fileUploadMonitoring,
  rateLimitMonitoring,
  writeSecurityLog,
  getSecurityStats,
  checkThresholds
};
