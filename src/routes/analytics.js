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

// Получить данные для графиков качества звонков
router.get('/call-quality', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Клиентское поведение по отделу (за 30 дней)
    const engagementByDayResult = await connection.query(`
      SELECT 
        date,
        AVG(client_speech_percentage) as avg_client_speech
      FROM call_quality 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY date
      ORDER BY date ASC
    `);

    // Средний % речи клиента за период (по всем звонкам)
    const engagementAvgResult = await connection.query(`
      SELECT 
        ROUND(AVG(client_speech_percentage)::DECIMAL, 2) as avg_engagement
      FROM call_quality 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const emotionalDistributionResult = await connection.query(`
      SELECT 
        COALESCE(emotional_tone, 'neutral') as emotional_tone,
        COUNT(*) as cnt
      FROM call_quality 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY COALESCE(emotional_tone, 'neutral')
    `);

    // Проценты по дням: доля звонков с фразами интереса/отказа среди всех звонков за день
    const triggersByDayResult = await connection.query(`
      WITH daily AS (
        SELECT 
          date,
          COUNT(*) AS total_calls,
          COUNT(*) FILTER (
            WHERE COALESCE(interest_phrases, '') <> '' 
              AND jsonb_array_length(interest_phrases::jsonb) > 0
          ) AS calls_with_interest,
          COUNT(*) FILTER (
            WHERE COALESCE(rejection_phrases, '') <> '' 
              AND jsonb_array_length(rejection_phrases::jsonb) > 0
          ) AS calls_with_rejection
        FROM call_quality
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY date
      )
      SELECT 
        date,
        CASE WHEN total_calls > 0 THEN ROUND(calls_with_interest::DECIMAL * 100 / total_calls, 2) ELSE 0 END AS interest_percent,
        CASE WHEN total_calls > 0 THEN ROUND(calls_with_rejection::DECIMAL * 100 / total_calls, 2) ELSE 0 END AS rejection_percent
      FROM daily
      ORDER BY date ASC
    `);

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
    
    // Построение распределения эмоционального тона
    const emotionalDistribution = emotionalDistributionResult.rows.reduce((acc, row) => {
      const total = Number(row.cnt || 0);
      const key = String(row.emotional_tone || 'neutral');
      acc[key] = (acc[key] || 0) + total;
      return acc;
    }, { positive: 0, neutral: 0, negative: 0 });

    // Вычисление доминирующего тона
    const dominantTone = Object.entries(emotionalDistribution)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

    // Простой тренд по вовлеченности: сравнение последних и первых значений
    const engagementSeries = engagementByDayResult.rows.map(r => Number(r.avg_client_speech || 0));
    let engagementTrend = 'flat';
    if (engagementSeries.length >= 3) {
      // Сравним среднее последних 3 дней с средним первых 3 дней для устойчивости
      const first = engagementSeries.slice(0, 3).reduce((a,b)=>a+b,0) / 3;
      const last = engagementSeries.slice(-3).reduce((a,b)=>a+b,0) / 3;
      const diff = last - first;
      engagementTrend = diff > 1 ? 'up' : diff < -1 ? 'down' : 'flat';
    } else if (engagementSeries.length >= 2) {
      const diff = engagementSeries[engagementSeries.length - 1] - engagementSeries[0];
      engagementTrend = diff > 1 ? 'up' : diff < -1 ? 'down' : 'flat';
    }

    res.json({
      // Клиентское поведение (для ClientAction)
      engagement: {
        data: engagementByDayResult.rows.map(row => ({
          date: row.date,
          engagement: Math.round(Number(row.avg_client_speech || 0))
        })),
        average: Math.round(Number(engagementAvgResult.rows[0]?.avg_engagement || 0)),
        trend: engagementTrend
      },
      emotionalTone: {
        distribution: {
          positive: Number(emotionalDistribution.positive || 0),
          neutral: Number(emotionalDistribution.neutral || 0),
          negative: Number(emotionalDistribution.negative || 0)
        },
        dominant: dominantTone
      },
      triggersByDay: {
        data: triggersByDayResult.rows.map(row => ({
          date: row.date,
          // Возвращаем проценты под старыми ключами, фронт ожидает проценты на оси
          interestCount: Number(row.interest_percent || 0),
          rejectionCount: Number(row.rejection_percent || 0)
        }))
      },
      summary: {
        totalCalls: Number(scriptComplianceResult.rows[0]?.total_calls || 0)
      },
      // Существующий блок аналитики качества
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
      }
    });
  } catch (error) {
    console.error('Error getting call quality analytics:', error);
    res.status(500).json({ message: 'Ошибка получения аналитики качества звонков' });
  }
});

// Добавить данные качества звонков
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
            client_speech_percentage = $7, emotional_tone = $8,
            interest_phrases = $9, rejection_phrases = $10
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
        (interestPhrases == null ? '[]' : interestPhrases),
        (rejectionPhrases == null ? '[]' : rejectionPhrases),
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
        (interestPhrases == null ? '[]' : interestPhrases),
        (rejectionPhrases == null ? '[]' : rejectionPhrases)
      ]);
    }
    
    res.json({ message: 'Данные качества звонка сохранены' });
  } catch (error) {
    console.error('Error saving call quality data:', error);
    res.status(500).json({ message: 'Ошибка сохранения данных качества звонка' });
  }
});

module.exports = router;