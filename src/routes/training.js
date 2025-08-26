const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const trainingAuth = require('../middleware/trainingAuth');
const DatabaseService = require('../services/databaseService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const SAFE_AUDIO_MIME = new Set(['audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/webm','audio/mp4']);
const MAX_AUDIO_SIZE = 50 * 1024 * 1024;

function hasDoubleExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 2;
}
function getSafeAudioExt(original) {
  const ext = path.extname(original || '').toLowerCase();
  const allowed = new Set(['.wav','.mp3','.ogg','.webm','.m4a']);
  return allowed.has(ext) ? ext : '';
}

// Безопасная настройка multer для загрузки аудио файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const rawCompany = req.headers['x-company-name'] || req.user.companyName || 'general';
    const companyName = String(rawCompany).replace(/[^a-zA-Z0-9_-]/g,'');
    const uploadDir = path.join('/app/uploads/companies', companyName, 'training');
    
    // Создаем директорию, если её нет
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const caseId = Number(req.body.caseId || req.params.caseId || 0);
    const attemptNumber = Number(req.body.attemptNumber || req.params.attemptNumber || 0);
    const timestamp = Date.now();
    const safeExt = getSafeAudioExt(file.originalname);
    cb(null, `case_${caseId}_attempt_${attemptNumber}_${timestamp}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_AUDIO_SIZE, files: 1, parts: 3 },
  fileFilter: (req, file, cb) => {
    const mimetype = (file.mimetype || '').toLowerCase();
    const name = file.originalname || '';
    if (hasDoubleExtension(name)) return cb(new Error('Запрещены двойные расширения'), false);
    if (!SAFE_AUDIO_MIME.has(mimetype)) return cb(new Error('Только аудио файлы разрешены'), false);
    const ext = getSafeAudioExt(name);
    if (!ext) return cb(new Error('Недопустимое аудио-расширение'), false);
    cb(null, true);
  }
});

// Вспомогательная функция для получения employee_id
async function getEmployeeId(connection, req, userId = null) {
  console.log('getEmployeeId called with:', { userId, apiKey: req.user.apiKey, user: req.user });
  
  if (req.user.apiKey) {
    // Если используется API ключ, userId - это ID в таблице employees
    if (!userId) {
      throw new Error('userId обязателен для API ключа');
    }
    
    console.log('Using API key, userId is employee ID:', userId);
    
    // Проверяем, что такой employee_id существует
    const employeeResult = await connection.query(
      'SELECT id FROM employees WHERE id = $1',
      [userId]
    );
    
    console.log('Employee result:', employeeResult.rows);
    
    if (employeeResult.rows.length === 0) {
      throw new Error('Пользователь не найден в таблице сотрудников');
    }
    
    return userId; // Возвращаем userId как есть, так как это уже employee ID
  } else {
    // Если используется JWT токен, используем ID из токена
    // req.user.id - это ID в таблице user_auth, нужно найти соответствующий employees.id
    const employeeResult = await connection.query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      throw new Error('Пользователь не найден в таблице сотрудников');
    }
    
    return employeeResult.rows[0].id;
  }
}

// POST - Получить все доступные кейсы для обучения
router.post('/get-cases', trainingAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    
    // userId обязателен только для API ключа
    if (req.user.apiKey && !userId) {
      return res.status(400).json({ message: 'userId обязателен для API ключа' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для указанного пользователя
    let employeeId;
    try {
      employeeId = await getEmployeeId(connection, req, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    
    // Получаем все кейсы для обучения
    const casesResult = await connection.query(`
      SELECT 
        id,
        title,
        length,
        recommendations,
        trail1_url,
        trail1_grade,
        trail2_url,
        trail2_grade,
        trail3_url,
        trail3_grade,
        updated_at
      FROM call_training 
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `, [employeeId]);
    
    res.json({
      success: true,
      cases: casesResult.rows
    });
  } catch (error) {
    console.error('Error getting training cases:', error);
    res.status(500).json({ message: 'Ошибка получения кейсов обучения' });
  }
});

// POST - Создать новый кейс обучения
router.post('/create-case', trainingAuth, async (req, res) => {
  try {
    const { title, length, recommendations, userId } = req.body;
    
    if (!title) {
      return res.status(400).json({ message: 'Название кейса обязательно' });
    }
    
    // userId обязателен только для API ключа
    if (req.user.apiKey && !userId) {
      return res.status(400).json({ message: 'userId обязателен для API ключа' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для указанного пользователя
    let employeeId;
    try {
      employeeId = await getEmployeeId(connection, req, userId);
      console.log('Found employeeId:', employeeId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    
    // Создаем новый кейс
    const result = await connection.query(`
      INSERT INTO call_training (user_id, title, length, recommendations, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id, title, length, recommendations, updated_at
    `, [employeeId, title, length || 0, recommendations || '']);
    
    res.json({
      success: true,
      case: result.rows[0],
      message: 'Кейс обучения создан'
    });
  } catch (error) {
    console.error('Error creating training case:', error);
    res.status(500).json({ message: 'Ошибка создания кейса обучения' });
  }
});

// POST - Загрузить аудио файл для попытки
router.post('/upload-audio', trainingAuth, upload.single('audio'), async (req, res) => {
  try {
    const { caseId, attemptNumber, userId } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Аудио файл не предоставлен' });
    }
    
    if (!caseId || !attemptNumber) {
      return res.status(400).json({ message: 'caseId и attemptNumber обязательны' });
    }
    
    // userId обязателен только для API ключа
    if (req.user.apiKey && !userId) {
      return res.status(400).json({ message: 'userId обязателен для API ключа' });
    }
    
    if (![1, 2, 3].includes(parseInt(attemptNumber))) {
      return res.status(400).json({ message: 'Номер попытки должен быть 1, 2 или 3' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для указанного пользователя
    let employeeId;
    try {
      employeeId = await getEmployeeId(connection, req, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    
    // Проверяем, что кейс принадлежит указанному пользователю
    const caseResult = await connection.query(
      'SELECT id FROM call_training WHERE id = $1 AND user_id = $2',
      [caseId, employeeId]
    );
    
    if (caseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Кейс не найден' });
    }
    
    // Формируем URL для доступа к файлу
    const companyName = req.user.companyName;
    const audioUrl = `https://logos-backend-production.up.railway.app/uploads/companies/${companyName}/training/${req.file.filename}`;
    
    // Обновляем URL для соответствующей попытки
    const trailColumn = `trail${attemptNumber}_url`;
    const result = await connection.query(`
      UPDATE call_training 
      SET ${trailColumn} = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3
      RETURNING id, ${trailColumn}
    `, [audioUrl, caseId, employeeId]);
    
    res.json({
      success: true,
      message: `Аудио для попытки ${attemptNumber} загружено`,
      audioUrl: result.rows[0][trailColumn],
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading attempt audio:', error);
    res.status(500).json({ message: 'Ошибка загрузки аудио попытки' });
  }
});

// POST - Обновить оценку для попытки
router.post('/update-grade', trainingAuth, async (req, res) => {
  try {
    const { caseId, attemptNumber, grade, userId } = req.body;
    
    if (grade === undefined || grade < 0 || grade > 100) {
      return res.status(400).json({ message: 'Оценка должна быть от 0 до 100' });
    }
    
    if (!caseId || !attemptNumber) {
      return res.status(400).json({ message: 'caseId и attemptNumber обязательны' });
    }
    
    // userId обязателен только для API ключа
    if (req.user.apiKey && !userId) {
      return res.status(400).json({ message: 'userId обязателен для API ключа' });
    }
    
    if (![1, 2, 3].includes(parseInt(attemptNumber))) {
      return res.status(400).json({ message: 'Номер попытки должен быть 1, 2 или 3' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для указанного пользователя
    let employeeId;
    try {
      employeeId = await getEmployeeId(connection, req, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    
    // Проверяем, что кейс принадлежит указанному пользователю
    const caseResult = await connection.query(
      'SELECT id FROM call_training WHERE id = $1 AND user_id = $2',
      [caseId, employeeId]
    );
    
    if (caseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Кейс не найден для указанного пользователя' });
    }
    
    // Обновляем оценку для соответствующей попытки
    const gradeColumn = `trail${attemptNumber}_grade`;
    const result = await connection.query(`
      UPDATE call_training 
      SET ${gradeColumn} = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3
      RETURNING id, ${gradeColumn}
    `, [grade, caseId, employeeId]);
    
    res.json({
      success: true,
      message: `Оценка для попытки ${attemptNumber} обновлена`,
      grade: result.rows[0][gradeColumn],
      userId: userId,
      caseId: caseId,
      attemptNumber: attemptNumber
    });
  } catch (error) {
    console.error('Error updating attempt grade:', error);
    res.status(500).json({ message: 'Ошибка обновления оценки попытки' });
  }
});

// POST - Получить детали конкретного кейса
router.post('/get-case', trainingAuth, async (req, res) => {
  try {
    const { caseId, userId } = req.body;
    
    if (!caseId) {
      return res.status(400).json({ message: 'caseId обязателен' });
    }
    
    // userId обязателен только для API ключа
    if (req.user.apiKey && !userId) {
      return res.status(400).json({ message: 'userId обязателен для API ключа' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для указанного пользователя
    let employeeId;
    try {
      employeeId = await getEmployeeId(connection, req, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    
    // Получаем детали кейса
    const caseResult = await connection.query(`
      SELECT 
        id,
        title,
        length,
        recommendations,
        trail1_url,
        trail1_grade,
        trail2_url,
        trail2_grade,
        trail3_url,
        trail3_grade,
        updated_at
      FROM call_training 
      WHERE id = $1 AND user_id = $2
    `, [caseId, employeeId]);
    
    if (caseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Кейс не найден' });
    }
    
    res.json({
      success: true,
      case: caseResult.rows[0]
    });
  } catch (error) {
    console.error('Error getting training case details:', error);
    res.status(500).json({ message: 'Ошибка получения деталей кейса' });
  }
});

// GET - Получить аудио файлы, ожидающие оценки (для n8n)
router.get('/pending-evaluations', trainingAuth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем все кейсы с загруженными аудио, но без оценок
    const pendingResult = await connection.query(`
      SELECT 
        ct.id as case_id,
        ct.title,
        ct.user_id,
        ua.first_name,
        ua.last_name,
        CASE 
          WHEN ct.trail1_url IS NOT NULL AND ct.trail1_grade = 0 THEN 1
          WHEN ct.trail2_url IS NOT NULL AND ct.trail2_grade = 0 THEN 2
          WHEN ct.trail3_url IS NOT NULL AND ct.trail3_grade = 0 THEN 3
          ELSE NULL
        END as attempt_number,
        CASE 
          WHEN ct.trail1_url IS NOT NULL AND ct.trail1_grade = 0 THEN ct.trail1_url
          WHEN ct.trail2_url IS NOT NULL AND ct.trail2_grade = 0 THEN ct.trail2_url
          WHEN ct.trail3_url IS NOT NULL AND ct.trail3_grade = 0 THEN ct.trail3_url
          ELSE NULL
        END as audio_url,
        ct.updated_at
      FROM call_training ct
      JOIN employees e ON ct.user_id = e.id
      JOIN user_auth ua ON e.user_id = ua.id
      WHERE 
        (ct.trail1_url IS NOT NULL AND ct.trail1_grade = 0) OR
        (ct.trail2_url IS NOT NULL AND ct.trail2_grade = 0) OR
        (ct.trail3_url IS NOT NULL AND ct.trail3_grade = 0)
      ORDER BY ct.updated_at ASC
    `);
    
    res.json({
      success: true,
      pendingEvaluations: pendingResult.rows
    });
  } catch (error) {
    console.error('Error getting pending evaluations:', error);
    res.status(500).json({ message: 'Ошибка получения ожидающих оценок' });
  }
});

// POST - Получить конкретный аудио файл для оценки
router.post('/get-evaluation', trainingAuth, async (req, res) => {
  try {
    const { caseId, attemptNumber, userId } = req.body;
    
    if (!caseId || !attemptNumber) {
      return res.status(400).json({ message: 'caseId и attemptNumber обязательны' });
    }
    
    // userId обязателен только для API ключа
    if (req.user.apiKey && !userId) {
      return res.status(400).json({ message: 'userId обязателен для API ключа' });
    }
    
    if (![1, 2, 3].includes(parseInt(attemptNumber))) {
      return res.status(400).json({ message: 'Номер попытки должен быть 1, 2 или 3' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для указанного пользователя
    let employeeId;
    try {
      employeeId = await getEmployeeId(connection, req, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    
    // Получаем информацию о конкретной попытке
    const trailUrlColumn = `trail${attemptNumber}_url`;
    const trailGradeColumn = `trail${attemptNumber}_grade`;
    
    const result = await connection.query(`
      SELECT 
        ct.id as case_id,
        ct.title,
        ct.user_id,
        ua.first_name,
        ua.last_name,
        ct.${trailUrlColumn} as audio_url,
        ct.${trailGradeColumn} as current_grade,
        ct.recommendations,
        ct.updated_at
      FROM call_training ct
      JOIN employees e ON ct.user_id = e.id
      JOIN user_auth ua ON e.user_id = ua.id
      WHERE ct.id = $1 AND ct.user_id = $2 AND ct.${trailUrlColumn} IS NOT NULL
    `, [caseId, employeeId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Аудио файл для оценки не найден' });
    }
    
    const evaluation = result.rows[0];
    
    // Проверяем, не оценен ли уже файл
    if (evaluation.current_grade > 0) {
      return res.status(400).json({ 
        message: `Попытка ${attemptNumber} уже оценена (оценка: ${evaluation.current_grade})` 
      });
    }
    
    res.json({
      success: true,
      evaluation: {
        caseId: evaluation.case_id,
        title: evaluation.title,
        employeeName: `${evaluation.first_name} ${evaluation.last_name}`,
        attemptNumber: parseInt(attemptNumber),
        audioUrl: evaluation.audio_url,
        recommendations: evaluation.recommendations,
        uploadedAt: evaluation.updated_at
      }
    });
  } catch (error) {
    console.error('Error getting evaluation details:', error);
    res.status(500).json({ message: 'Ошибка получения деталей оценки' });
  }
});

// Обработка ошибок multer для training
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Аудио файл слишком большой' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Слишком много файлов' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Неожиданное поле файла' });
    }
    return res.status(400).json({ message: 'Ошибка загрузки аудио файла' });
  }
  
  if (error.message) {
    return res.status(400).json({ message: error.message });
  }
  
  next(error);
});

module.exports = router;
