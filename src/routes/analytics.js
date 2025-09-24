const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const DatabaseService = require('../services/databaseService');

// Получить данные для графиков аналитики отдела
router.get('/department', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // 1. Общее число звонков (с трендом)
    const totalCallsResult = await connection.query(`
      SELECT 
        SUM(total_calls) as total_calls,
        COUNT(*) as days_with_data,
        AVG(total_calls) as avg_daily_calls
      FROM department_analytics 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    // 2. Средняя длительность звонка по дням (гистограмма)
    const callDurationResult = await connection.query(`
      SELECT 
        date,
        AVG(call_duration_seconds) as avg_duration
      FROM (
        SELECT date, call_duration_seconds
        FROM department_analytics 
        GROUP BY date, call_duration_seconds
        ORDER BY date DESC
        LIMIT 7
      ) subquery
      GROUP BY date
      ORDER BY date ASC
    `);
    
    // 3. Количество успешных звонков (кольцевая диаграмма)
    const successfulCallsResult = await connection.query(`
      SELECT 
        SUM(successful_calls) as successful_calls,
        SUM(total_calls) as total_calls,
        CASE 
          WHEN SUM(total_calls) > 0 THEN 
            ROUND((SUM(successful_calls)::DECIMAL / SUM(total_calls)::DECIMAL) * 100, 2)
          ELSE 0 
        END as success_rate
      FROM department_analytics 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    

    
    res.json({
      totalCalls: {
        total: totalCallsResult.rows[0]?.total_calls || 0,
        avgDaily: totalCallsResult.rows[0]?.avg_daily_calls || 0,
        trend: 'up' // Можно добавить логику расчета тренда
      },
      callDuration: {
        data: callDurationResult.rows.map(row => ({
          date: row.date,
          duration: Math.round(row.avg_duration || 0)
        }))
      },
      successfulCalls: {
        successful: successfulCallsResult.rows[0]?.successful_calls || 0,
        total: successfulCallsResult.rows[0]?.total_calls || 0,
        rate: successfulCallsResult.rows[0]?.success_rate || 0
      },

    });
  } catch (error) {
    console.error('Error getting department analytics:', error);
    res.status(500).json({ message: 'Ошибка получения аналитики отдела' });
  }
});

// Добавить данные аналитики
router.post('/department', auth, async (req, res) => {
  try {
    const { date, totalCalls, successfulCalls, callDurationSeconds } = req.body;
    
    if (!date) {
      return res.status(400).json({ message: 'Дата обязательна' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для текущего пользователя
    const employeeResult = await connection.query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(400).json({ message: 'Пользователь не найден в таблице сотрудников' });
    }
    
    const employeeId = employeeResult.rows[0].id;
    
    // Проверяем, есть ли уже запись на эту дату для этого сотрудника
    const existingRecord = await connection.query(
      'SELECT id FROM department_analytics WHERE user_id = $1 AND date = $2',
      [employeeId, date]
    );
    
    if (existingRecord.rows.length > 0) {
      // Обновляем существующую запись
      await connection.query(`
        UPDATE department_analytics 
        SET total_calls = $1, successful_calls = $2, call_duration_seconds = $3
        WHERE user_id = $4 AND date = $5
      `, [totalCalls || 0, successfulCalls || 0, callDurationSeconds || 0, employeeId, date]);
    } else {
      // Создаем новую запись
      await connection.query(`
        INSERT INTO department_analytics (user_id, date, total_calls, successful_calls, call_duration_seconds)
        VALUES ($1, $2, $3, $4, $5)
      `, [employeeId, date, totalCalls || 0, successfulCalls || 0, callDurationSeconds || 0]);
    }
    
    res.json({ message: 'Данные аналитики сохранены' });
  } catch (error) {
    console.error('Error saving department analytics:', error);
    res.status(500).json({ message: 'Ошибка сохранения данных аналитики' });
  }
});

// Получить данные для графиков качества звонков + поведения клиента
router.get('/call-quality', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // 1. Соблюдение скрипта - % звонков с выполнением всех этапов
    const scriptComplianceResult = await connection.query(`
      SELECT 
        AVG(script_compliance_percentage) as avg_compliance,
        COUNT(*) as total_calls,
        COUNT(CASE WHEN script_compliance_percentage = 100 THEN 1 END) as perfect_calls,
        COUNT(CASE WHEN script_compliance_percentage < 100 THEN 1 END) as imperfect_calls
      FROM call_quality 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    // 2. Частота пропусков по блокам (стекированная гистограмма)
    const stageComplianceResult = await connection.query(`
      SELECT 
        date,
        AVG(stages_completed::DECIMAL / total_stages::DECIMAL * 100) as completion_rate,
        AVG(total_stages - stages_completed) as missed_stages
      FROM (
        SELECT date, stages_completed, total_stages
        FROM call_quality 
        GROUP BY date, stages_completed, total_stages
        ORDER BY date DESC
        LIMIT 7
      ) subquery
      GROUP BY date
      ORDER BY date ASC
    `);
    
    // 3. Использование ключевых фраз
    const keyPhrasesResult = await connection.query(`
      SELECT 
        u.first_name,
        u.last_name,
        AVG(cq.key_phrases_used) as avg_key_phrases
      FROM call_quality cq
      JOIN employees e ON cq.user_id = e.id
      JOIN user_auth u ON e.user_id = u.id
      WHERE cq.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY avg_key_phrases DESC
    `);
    
    // 4. Запрещенные фразы
    const forbiddenPhrasesResult = await connection.query(`
      WITH latest_calls AS (
        SELECT 
          cq.user_id,
          MAX(cq.created_at) as latest_call_time
        FROM call_quality cq
        WHERE cq.forbidden_phrases_count > 0 
          AND cq.date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY cq.user_id
      )
      SELECT 
        u.first_name,
        u.last_name,
        cq.forbidden_phrases_count as incidents_count,
        cq.forbidden_phrases_list as phrases_list
      FROM call_quality cq
      JOIN employees e ON cq.user_id = e.id
      JOIN user_auth u ON e.user_id = u.id
      JOIN latest_calls lc ON cq.user_id = lc.user_id AND cq.created_at = lc.latest_call_time
      WHERE cq.forbidden_phrases_count > 0
      ORDER BY cq.forbidden_phrases_count DESC
    `);

    // 5. Вовлеченность клиента (% речи клиента) по дням - все сотрудники
    const clientEngagementResult = await connection.query(`
      SELECT 
        date,
        AVG(client_speech_percentage) as avg_speech_percentage
      FROM (
        SELECT date, client_speech_percentage
        FROM call_quality
        WHERE client_speech_percentage IS NOT NULL
          AND date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY date DESC
        LIMIT 7
      ) subquery
      GROUP BY date
      ORDER BY date ASC
    `);

    // 6. Эмоциональный тон распределение - все сотрудники
    const emotionalToneResult = await connection.query(`
      SELECT 
        emotional_tone,
        COUNT(*) as count
      FROM call_quality 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days' 
        AND emotional_tone IS NOT NULL
      GROUP BY emotional_tone
    `);

    // 7. Фразы интереса и отказа - все сотрудники
    const phrasesResult = await connection.query(`
      SELECT 
        interest_phrases,
        rejection_phrases
      FROM call_quality 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days' 
        AND (interest_phrases IS NOT NULL OR rejection_phrases IS NOT NULL)
    `);

    // 8. Триггеры по дням - новый запрос
    const triggersByDayResult = await connection.query(`
      SELECT 
        date,
        COUNT(CASE WHEN interest_phrases IS NOT NULL AND interest_phrases != '[]' THEN 1 END) as interest_count,
        COUNT(CASE WHEN rejection_phrases IS NOT NULL AND rejection_phrases != '[]' THEN 1 END) as rejection_count
      FROM call_quality 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY date
      ORDER BY date DESC
      LIMIT 7
    `);



    // Обработка фраз интереса и отказа
    let interestPhrases = {};
    let rejectionPhrases = {};
    
    phrasesResult.rows.forEach(row => {
      // Парсим фразы интереса
      if (row.interest_phrases) {
        try {
          const phrases = JSON.parse(row.interest_phrases);
          if (Array.isArray(phrases)) {
            phrases.forEach(phrase => {
              interestPhrases[phrase] = (interestPhrases[phrase] || 0) + 1;
            });
          }
        } catch (e) {
          // Если не JSON, то просто текст - разделяем по запятой
          const phrases = row.interest_phrases.split(',');
          phrases.forEach(phrase => {
            const trimmed = phrase.trim();
            if (trimmed) {
              interestPhrases[trimmed] = (interestPhrases[trimmed] || 0) + 1;
            }
          });
        }
      }
      
      // Парсим фразы отказа
      if (row.rejection_phrases) {
        try {
          const phrases = JSON.parse(row.rejection_phrases);
          if (Array.isArray(phrases)) {
            phrases.forEach(phrase => {
              rejectionPhrases[phrase] = (rejectionPhrases[phrase] || 0) + 1;
            });
          }
        } catch (e) {
          // Если не JSON, то просто текст - разделяем по запятой
          const phrases = row.rejection_phrases.split(',');
          phrases.forEach(phrase => {
            const trimmed = phrase.trim();
            if (trimmed) {
              rejectionPhrases[trimmed] = (rejectionPhrases[trimmed] || 0) + 1;
            }
          });
        }
      }
    });

    // Сортируем топ-5 фраз
    const topInterestPhrases = Object.entries(interestPhrases)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    const topRejectionPhrases = Object.entries(rejectionPhrases)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    res.json({
      // СУЩЕСТВУЮЩИЕ ДАННЫЕ КАЧЕСТВА ЗВОНКОВ
      scriptCompliance: {
        avgCompliance: Math.round(scriptComplianceResult.rows[0]?.avg_compliance || 0),
        totalCalls: scriptComplianceResult.rows[0]?.total_calls || 0,
        perfectCalls: scriptComplianceResult.rows[0]?.perfect_calls || 0,
        imperfectCalls: scriptComplianceResult.rows[0]?.imperfect_calls || 0
      },
      stageCompliance: {
        data: stageComplianceResult.rows.map(row => ({
          date: row.date,
          completionRate: Math.round(row.completion_rate || 0),
          missedStages: Math.round(row.missed_stages || 0)
        }))
      },
      keyPhrases: {
        managers: keyPhrasesResult.rows.map(row => ({
          name: `${row.first_name} ${row.last_name}`,
          avgPhrases: Math.round(row.avg_key_phrases || 0)
        }))
      },
      forbiddenPhrases: {
        incidents: forbiddenPhrasesResult.rows.map(row => ({
          name: `${row.first_name} ${row.last_name}`,
          count: parseInt(row.incidents_count),
          phrases: row.phrases_list || ''
        }))
      },

      // НОВЫЕ ДАННЫЕ ПОВЕДЕНИЯ КЛИЕНТА
      engagement: {
        data: clientEngagementResult.rows.map(row => ({
          date: row.date,
          engagement: Math.round(Number(row.avg_speech_percentage) || 0)
        })),
        average: Math.round(
          clientEngagementResult.rows.reduce(
            (sum, row) => sum + Number(row.avg_speech_percentage || 0),
            0
          ) / (clientEngagementResult.rows.length || 1)
        ),
        trend: clientEngagementResult.rows.length >= 2 && 
               clientEngagementResult.rows[0].avg_speech_percentage > 
               clientEngagementResult.rows[clientEngagementResult.rows.length - 1].avg_speech_percentage 
               ? 'up' : 'down'
      },
      emotionalTone: {
        distribution: emotionalToneResult.rows.reduce((acc, row) => {
          acc[row.emotional_tone] = parseInt(row.count);
          return acc;
        }, {}),
        dominant: emotionalToneResult.rows.length > 0 
          ? emotionalToneResult.rows.reduce((max, row) => 
              parseInt(row.count) > parseInt(max.count) ? row : max).emotional_tone
          : 'neutral'
      },
      interestTriggers: {
        interestPhrases: topInterestPhrases.map(([phrase, count]) => ({ phrase, count })),
        rejectionPhrases: topRejectionPhrases.map(([phrase, count]) => ({ phrase, count })),
        totalInterestPhrases: Object.values(interestPhrases).reduce((sum, count) => sum + count, 0),
        totalRejectionPhrases: Object.values(rejectionPhrases).reduce((sum, count) => sum + count, 0)
      },
      summary: {
        totalCalls: scriptComplianceResult.rows[0]?.total_calls || 0,
        periodDays: 30
      }
    });
  } catch (error) {
    console.error('Error getting call quality analytics:', error);
    res.status(500).json({ message: 'Ошибка получения аналитики качества звонков' });
  }
});

// Добавить данные качества звонков + поведения клиента
router.post('/call-quality', auth, async (req, res) => {
  try {
    const { 
      date, 
      callId, 
      scriptCompliancePercentage, 
      stagesCompleted, 
      totalStages,
      keyPhrasesUsed,
      forbiddenPhrasesCount,
      forbiddenPhrasesList,
      // НОВЫЕ ПОЛЯ ПОВЕДЕНИЯ КЛИЕНТА
      clientSpeechPercentage,
      emotionalTone,
      interestPhrases,
      rejectionPhrases
    } = req.body;
    
    if (!date || !callId) {
      return res.status(400).json({ message: 'Дата и ID звонка обязательны' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для текущего пользователя
    const employeeResult = await connection.query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(400).json({ message: 'Пользователь не найден в таблице сотрудников' });
    }
    
    const employeeId = employeeResult.rows[0].id;
    
    // Преобразуем массивы фраз в JSON строки
    const interestPhrasesJson = Array.isArray(interestPhrases) 
      ? JSON.stringify(interestPhrases) 
      : interestPhrases || '[]';
    
    const rejectionPhrasesJson = Array.isArray(rejectionPhrases) 
      ? JSON.stringify(rejectionPhrases) 
      : rejectionPhrases || '[]';
    
    // Проверяем, есть ли уже запись для этого звонка
    const existingRecord = await connection.query(
      'SELECT id FROM call_quality WHERE call_id = $1',
      [callId]
    );
    
    if (existingRecord.rows.length > 0) {
      // Обновляем существующую запись
      await connection.query(`
        UPDATE call_quality 
        SET script_compliance_percentage = $1, stages_completed = $2, total_stages = $3,
            key_phrases_used = $4, forbidden_phrases_count = $5, forbidden_phrases_list = $6,
            client_speech_percentage = $7, emotional_tone = $8, interest_phrases = $9, rejection_phrases = $10
        WHERE call_id = $11
      `, [
        scriptCompliancePercentage || 0, 
        stagesCompleted || 0, 
        totalStages || 0,
        keyPhrasesUsed || 0, 
        forbiddenPhrasesCount || 0, 
        forbiddenPhrasesList || '',
        clientSpeechPercentage || 0,
        emotionalTone || 'neutral',
        interestPhrasesJson,
        rejectionPhrasesJson,
        callId
      ]);
    } else {
      // Создаем новую запись
      await connection.query(`
        INSERT INTO call_quality (user_id, date, call_id, script_compliance_percentage, 
                                 stages_completed, total_stages, key_phrases_used, 
                                 forbidden_phrases_count, forbidden_phrases_list,
                                 client_speech_percentage, emotional_tone, interest_phrases, rejection_phrases)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        employeeId, 
        date, 
        callId, 
        scriptCompliancePercentage || 0, 
        stagesCompleted || 0, 
        totalStages || 0,
        keyPhrasesUsed || 0, 
        forbiddenPhrasesCount || 0, 
        forbiddenPhrasesList || '',
        clientSpeechPercentage || 0,
        emotionalTone || 'neutral',
        interestPhrasesJson,
        rejectionPhrasesJson
      ]);
    }
    
    res.json({ message: 'Данные качества звонка и поведения клиента сохранены' });
  } catch (error) {
    console.error('Error saving call quality data:', error);
    res.status(500).json({ message: 'Ошибка сохранения данных качества звонка' });
  }
});

module.exports = router;