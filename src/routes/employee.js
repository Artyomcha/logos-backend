const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const combinedAuth = require('../middleware/combinedAuth');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Настройка multer для аудио файлов
const audioStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const companyName = req.user?.companyName || 'general';
    const uploadPath = path.join(__dirname, '../../uploads/companies', companyName, 'calls');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const callId = req.params.callId || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `call_${callId}${ext}`);
  }
});

// Настройка multer для универсальной загрузки аудио
const universalAudioStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Определяем компанию - приоритет у заголовка X-Company-Name, затем у поля формы, затем у токена
    const companyName = req.headers['x-company-name'] || req.body.companyName || req.user?.companyName || 'general';
    const uploadPath = path.join(__dirname, '../../uploads/companies', companyName, 'calls');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `call_${timestamp}_${randomSuffix}${ext}`);
  }
});

const uploadAudio = multer({ 
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB для аудио
  fileFilter: function (req, file, cb) {
    // Разрешаем только аудио файлы
    const allowedTypes = ['.wav', '.mp3', '.m4a', '.aac', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Только аудио файлы разрешены'), false);
    }
  }
});

const uploadUniversalAudio = multer({ 
  storage: universalAudioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB для аудио
  fileFilter: function (req, file, cb) {
    // Разрешаем только аудио файлы
    const allowedTypes = ['.wav', '.mp3', '.m4a', '.aac', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Только аудио файлы разрешены'), false);
    }
  }
});

// Middleware для получения базы данных компании из токена
const getCompanyDatabase = async (req, res, next) => {
  try {
    // Получаем companyName из токена пользователя (с большой буквы)
    const companyName = req.user.companyName;
    console.log('Company database middleware - companyName:', companyName);
    
    if (!companyName) {
      console.log('Company name not found in token');
      return res.status(400).json({ 
        error: 'Company name not found in user token' 
      });
    }

    // Формируем имя базы данных
    const databaseName = `logos_ai_${companyName}`;
    req.companyDatabase = databaseName;
    req.companyName = companyName; // Добавляем companyName в req для использования в универсальной загрузке
    console.log('Company database name:', databaseName);
    
    next();
  } catch (error) {
    console.error('Error in company database middleware:', error);
    res.status(500).json({ 
      error: 'Failed to get company database' 
    });
  }
};

// Получение звонков сотрудника
router.get('/calls', auth, getCompanyDatabase, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Employee calls request - userId:', userId);
    console.log('Company database:', req.companyDatabase);
    
    // Получаем данные из dialogues и overall_data через таблицу employees
    const query = `
      SELECT 
        d.id,
        d.recorded_at as call_date,
        d.task_name as customer_name,
        od.grade as overall_score
      FROM dialogues d
      LEFT JOIN overall_data od ON d.task_name = od.task_name
      LEFT JOIN employees e ON d.user_id = e.id
      WHERE e.user_id = $1
      ORDER BY d.recorded_at DESC
      LIMIT 50
    `;

    console.log('SQL Query:', query);
    console.log('Query params:', [userId]);

    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: req.companyDatabase,
    });

    const result = await pool.query(query, [userId]);
    console.log('Query result rows:', result.rows.length);
    console.log('First row sample:', result.rows[0]);
    
    await pool.end();

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting employee calls:', error);
    res.status(500).json({ message: 'Ошибка при получении звонков' });
  }
});

// Получение деталей конкретного звонка
router.get('/calls/:callId', auth, getCompanyDatabase, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;
    console.log('Fetching call details for ID:', callId, 'userId:', userId);
    
    const query = `
      SELECT 
        d.id,
        d.recorded_at,
        d.task_name as customer_name,
        od.grade as overall_score,
        d.full_dialogue,
        d.audio_file_url
      FROM dialogues d
      LEFT JOIN overall_data od ON d.task_name = od.task_name
      LEFT JOIN employees e ON d.user_id = e.id
      WHERE e.user_id = $1 AND d.id = $2
    `;

    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: req.companyDatabase,
    });

    const result = await pool.query(query, [userId, callId]);
    await pool.end();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }
    
    const callData = result.rows[0];
    
    // Получаем диалог из поля full_dialogue как есть
    let transcript = null;
    if (callData.full_dialogue) {
      // Создаем простую структуру для отображения всего диалога
      transcript = [
        {
          speaker: 'dialogue',
          text: callData.full_dialogue
        }
      ];
    }
    
    res.json({
      id: callData.id,
      recorded_at: callData.recorded_at,
      customer_name: callData.customer_name,
      overall_score: callData.overall_score,
      transcript: transcript,
      audio_url: callData.audio_file_url || `/uploads/companies/${req.user.companyName}/calls/call_${callId}.wav`
    });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({ error: 'Ошибка получения деталей звонка' });
  }
});

// Загрузка аудио файла для звонка
router.post('/calls/:callId/audio', auth, getCompanyDatabase, uploadAudio.single('audio'), async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;
    
    console.log('Audio upload request for call ID:', callId, 'userId:', userId);
    
    if (!req.file) {
      return res.status(400).json({ message: 'Аудио файл не загружен' });
    }
    
    console.log('Audio file received:', req.file.originalname);
    
    // Формируем URL для аудио файла
    const audioUrl = `/uploads/companies/${req.user.companyName}/calls/${req.file.filename}`;
    console.log('Audio URL:', audioUrl);
    
    // Подключаемся к базе данных компании
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: req.companyDatabase,
    });
    
    // Проверяем, что звонок существует и принадлежит пользователю
    const checkQuery = `
      SELECT d.id FROM dialogues d
      LEFT JOIN employees e ON d.user_id = e.id
      WHERE e.user_id = $1 AND d.id = $2
    `;
    
    const checkResult = await pool.query(checkQuery, [userId, callId]);
    
    if (checkResult.rows.length === 0) {
      await pool.end();
      return res.status(404).json({ message: 'Звонок не найден или у вас нет доступа к нему' });
    }
    
    // Обновляем запись в таблице dialogues
    const updateQuery = `
      UPDATE dialogues 
      SET audio_file_url = $1 
      WHERE id = $2
    `;
    
    await pool.query(updateQuery, [audioUrl, callId]);
    await pool.end();
    
    console.log('Audio file URL saved to database for call ID:', callId);
    
    res.json({ 
      message: 'Аудио файл успешно загружен',
      audio_url: audioUrl,
      call_id: callId
    });
    
  } catch (error) {
    console.error('Error uploading audio file:', error);
    res.status(500).json({ 
      message: 'Ошибка при загрузке аудио файла',
      error: error.message 
    });
  }
});

// Универсальная загрузка аудио файла (автоматически создает запись в dialogues)
router.post('/audio/upload', combinedAuth, uploadUniversalAudio.single('audio'), async (req, res) => {
  try {
    const { 
      task_name, 
      full_dialogue, 
      companyName, 
      userId, 
      grade
    } = req.body;
    
    console.log('Universal audio upload request for userId:', userId, 'companyName from body:', companyName);
    console.log('Company name from middleware:', req.companyName);
    console.log('Company name from user object:', req.user?.companyName);
    
    if (!req.file) {
      return res.status(400).json({ message: 'Аудио файл не загружен' });
    }
    
    console.log('Audio file received:', req.file.originalname);
    
    // Определяем компанию - приоритет у middleware, затем у тела запроса
    const finalCompanyName = req.companyName || companyName || req.user?.companyName;
    
    if (!finalCompanyName) {
      return res.status(400).json({ 
        message: 'Не указана компания. Используйте заголовок X-Company-Name или поле companyName в форме',
        debug: {
          middlewareCompany: req.companyName,
          bodyCompany: companyName,
          userCompany: req.user?.companyName
        }
      });
    }
    
    console.log('Final company name determined:', finalCompanyName);
    
    // Определяем userId - приоритет у переданного userId, затем у токена
    const finalUserId = userId || req.user?.id || 1; // По умолчанию ID 1
    
    // Формируем URL для аудио файла
    const audioUrl = `/uploads/companies/${finalCompanyName}/calls/${req.file.filename}`;
    console.log('Audio URL:', audioUrl);
    
    // Формируем имя базы данных компании
    const databaseName = `logos_ai_${finalCompanyName}`;
    console.log('Database name:', databaseName);
    
    // Подключаемся к базе данных компании
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: databaseName,
    });
    
    // Если передан task_name, создаем/обновляем запись в overall_data с реальными полями
    if (task_name) {
      // Проверяем, существует ли task_name в overall_data
      const checkTaskQuery = 'SELECT task_name FROM overall_data WHERE task_name = $1';
      const taskResult = await pool.query(checkTaskQuery, [task_name]);
      
      if (taskResult.rows.length === 0) {
        // Создаем запись в overall_data с реальными полями
        const insertTaskQuery = `
          INSERT INTO overall_data (task_name, grade, user_id, report)
          VALUES ($1, $2, $3, $4)
        `;
        await pool.query(insertTaskQuery, [
          task_name, 
          grade || 0, 
          finalUserId,
          full_dialogue || ''
        ]);
        console.log('Created task record in overall_data:', task_name);
      } else {
        // Обновляем существующую запись с реальными полями
        const updateTaskQuery = `
          UPDATE overall_data 
          SET grade = $1, user_id = $2, report = $3
          WHERE task_name = $4
        `;
        await pool.query(updateTaskQuery, [
          grade || 0, 
          finalUserId,
          full_dialogue || '',
          task_name
        ]);
        console.log('Updated task record in overall_data:', task_name);
      }
    }
    
    // Создаем новую запись в таблице dialogues
    let insertQuery, queryParams;
    
    if (task_name) {
      // Если task_name передан, включаем его в запрос
      insertQuery = `
        INSERT INTO dialogues (user_id, task_name, full_dialogue, audio_file_url, recorded_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id
      `;
      queryParams = [finalUserId, task_name, full_dialogue || '', audioUrl];
    } else {
      // Если task_name не передан, не включаем его в запрос
      insertQuery = `
        INSERT INTO dialogues (user_id, full_dialogue, audio_file_url, recorded_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `;
      queryParams = [finalUserId, full_dialogue || '', audioUrl];
    }
    
    const result = await pool.query(insertQuery, queryParams);
    
    const newCallId = result.rows[0].id;
    await pool.end();
    
    console.log('New call record created with ID:', newCallId, 'in company:', finalCompanyName, 'for user:', finalUserId);
    
    res.json({ 
      message: 'Аудио файл и данные успешно загружены',
      audio_url: audioUrl,
      call_id: newCallId,
      task_name: task_name || null,
      company_name: finalCompanyName,
      user_id: finalUserId,
      grade: grade || 0
    });
    
  } catch (error) {
    console.error('Error uploading audio file:', error);
    res.status(500).json({ 
      message: 'Ошибка при загрузке аудио файла',
      error: error.message 
    });
  }
});

module.exports = router;
