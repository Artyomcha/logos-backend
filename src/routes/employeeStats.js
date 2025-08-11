const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const DatabaseService = require('../services/databaseService');

// POST - Добавить новую запись статистики сотрудника
router.post('/', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id из таблицы employees
    const employeeResult = await connection.query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(400).json({ message: 'Пользователь не найден в таблице сотрудников' });
    }
    
    const employeeId = employeeResult.rows[0].id;
    
    const {
      rating,
      calls,
      deals,
      plan,
      error,
      avg_call_duration_minutes,
      script_compliance_percentage,
      key_phrases_used,
      forbidden_phrases_count,
      stages_completed,
      total_stages,
      success_rate_percentage,
      date
    } = req.body;

    // Проверяем, есть ли уже запись на эту дату
    const existingRecord = await connection.query(
      'SELECT id FROM employee_stats WHERE user_id = $1 AND date = $2',
      [employeeId, date || new Date().toISOString().split('T')[0]]
    );

    if (existingRecord.rows.length > 0) {
      // Обновляем существующую запись
      await connection.query(`
        UPDATE employee_stats SET
          rating = $1,
          calls = $2,
          deals = $3,
          plan = $4,
          error = $5,
          avg_call_duration_minutes = $6,
          script_compliance_percentage = $7,
          key_phrases_used = $8,
          forbidden_phrases_count = $9,
          stages_completed = $10,
          total_stages = $11,
          success_rate_percentage = $12,
          created_at = CURRENT_TIMESTAMP
        WHERE user_id = $13 AND date = $14
      `, [
        rating || 0,
        calls || 0,
        deals || 0,
        plan || 0,
        error || 0,
        avg_call_duration_minutes || 0,
        script_compliance_percentage || 0,
        key_phrases_used || 0,
        forbidden_phrases_count || 0,
        stages_completed || 0,
        total_stages || 0,
        success_rate_percentage || 0,
        employeeId,
        date || new Date().toISOString().split('T')[0]
      ]);
    } else {
      // Создаем новую запись
      await connection.query(`
        INSERT INTO employee_stats (
          user_id, rating, calls, deals, plan, error,
          avg_call_duration_minutes, script_compliance_percentage,
          key_phrases_used, forbidden_phrases_count,
          stages_completed, total_stages, success_rate_percentage, date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        employeeId,
        rating || 0,
        calls || 0,
        deals || 0,
        plan || 0,
        error || 0,
        avg_call_duration_minutes || 0,
        script_compliance_percentage || 0,
        key_phrases_used || 0,
        forbidden_phrases_count || 0,
        stages_completed || 0,
        total_stages || 0,
        success_rate_percentage || 0,
        date || new Date().toISOString().split('T')[0]
      ]);
    }

    res.json({ message: 'Статистика сотрудника успешно сохранена' });
  } catch (error) {
    console.error('Error saving employee stats:', error);
    res.status(500).json({ message: 'Ошибка сохранения статистики' });
  }
});

// GET - Получить агрегированную статистику сотрудника
router.get('/:employeeId', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    const { employeeId } = req.params;

    // Получаем агрегированную статистику
    const statsResult = await connection.query(`
      SELECT 
        ROUND(AVG(rating), 1) as avg_rating,
        SUM(calls) as total_calls,
        SUM(deals) as total_deals,
        SUM(plan) as total_plan,
        SUM(error) as total_error,
        ROUND(AVG(avg_call_duration_minutes), 1) as avg_call_duration_minutes,
        ROUND(AVG(script_compliance_percentage), 1) as avg_script_compliance_percentage,
        SUM(key_phrases_used) as total_key_phrases_used,
        SUM(forbidden_phrases_count) as total_forbidden_phrases_count,
        SUM(stages_completed) as total_stages_completed,
        SUM(total_stages) as total_stages,
        ROUND(AVG(success_rate_percentage), 1) as avg_success_rate_percentage,
        COUNT(*) as records_count
      FROM employee_stats 
      WHERE user_id = $1
    `, [employeeId]);

    // Получаем данные для графиков (последние 7 дней)
    const weeklyData = await connection.query(`
      SELECT 
        date,
        calls,
        deals,
        avg_call_duration_minutes,
        script_compliance_percentage,
        success_rate_percentage
      FROM employee_stats 
      WHERE user_id = $1 
      ORDER BY date DESC 
      LIMIT 7
    `, [employeeId]);

    // Получаем данные для графиков (последние 12 месяцев)
    const monthlyData = await connection.query(`
      SELECT 
        DATE_TRUNC('month', date) as month,
        SUM(calls) as calls,
        SUM(deals) as deals,
        ROUND(AVG(avg_call_duration_minutes), 1) as avg_call_duration_minutes,
        ROUND(AVG(script_compliance_percentage), 1) as script_compliance_percentage,
        ROUND(AVG(success_rate_percentage), 1) as success_rate_percentage
      FROM employee_stats 
      WHERE user_id = $1 
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY month DESC 
      LIMIT 12
    `, [employeeId]);

    const aggregatedStats = statsResult.rows[0] || {};
    const weeklyTrend = weeklyData.rows.reverse(); // Сортируем по возрастанию даты
    const monthlyTrend = monthlyData.rows.reverse(); // Сортируем по возрастанию даты

    res.json({
      aggregatedStats,
      weeklyTrend,
      monthlyTrend
    });
  } catch (error) {
    console.error('Error getting employee stats:', error);
    res.status(500).json({ message: 'Ошибка получения статистики' });
  }
});

// GET - Получить все записи статистики сотрудника
router.get('/:employeeId/records', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    const { employeeId } = req.params;

    const recordsResult = await connection.query(`
      SELECT * FROM employee_stats 
      WHERE user_id = $1 
      ORDER BY date DESC
    `, [employeeId]);

    res.json(recordsResult.rows);
  } catch (error) {
    console.error('Error getting employee stats records:', error);
    res.status(500).json({ message: 'Ошибка получения записей статистики' });
  }
});

module.exports = router; 