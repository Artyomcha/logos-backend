const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Pool } = require('pg');

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

module.exports = router;
