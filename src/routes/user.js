const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getUserById } = require('../models/user');
const DatabaseService = require('../services/databaseService');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Простое локальное хранилище для аватаров
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const companyName = req.user?.companyName || 'general';
    const uploadPath = path.join(__dirname, '../../uploads/companies', companyName, 'avatars');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

router.get('/profile', auth, async (req, res) => {
  try {
    console.log('Profile request from user:', req.user);
    const user = await getUserById(req.user.id, req.user.companyName);
    if (!user) {
      console.log('User not found:', req.user.id, req.user.companyName);
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    console.log('User found:', user.email);
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      avatarUrl: user.avatar_url || null,
      companyName: user.company_name,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Ошибка при получении профиля' });
  }
});

router.post('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await getUserById(req.user.id, req.user.companyName);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(400).json({ message: 'Неверный текущий пароль' });
    
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    await connection.query(
      'UPDATE user_auth SET password_hash = $1 WHERE id = $2',
      [passwordHash, req.user.id]
    );
    
    res.json({ message: 'Пароль изменен' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Ошибка при смене пароля' });
  }
});

router.post('/set-password', auth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await getUserById(req.user.id, req.user.companyName);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    await connection.query(
      'UPDATE user_auth SET password_hash = $1 WHERE id = $2',
      [passwordHash, req.user.id]
    );
    
    res.json({ message: 'Пароль установлен' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ message: 'Ошибка при установке пароля' });
  }
});

// Загрузка аватара через multer
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Файл не загружен' });
    
    const ext = path.extname(req.file.originalname).toLowerCase();
    const newName = `avatar_${Date.now()}${ext}`;
    const newPath = path.join(req.file.destination, newName);
    fs.renameSync(req.file.path, newPath);
    
    const avatarUrl = `/uploads/companies/${req.user.companyName}/avatars/${newName}`;
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    await connection.query(
      'UPDATE user_auth SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, req.user.id]
    );
    
    res.json({ avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ message: 'Ошибка при загрузке аватара' });
  }
});

// Обновление аватара пользователя (для прямой загрузки)
router.patch('/update-avatar', auth, async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    
    if (!avatarUrl) {
      return res.status(400).json({ message: 'URL аватара обязателен' });
    }
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    await connection.query(
      'UPDATE user_auth SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, req.user.id]
    );
    
    res.json({ avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ message: 'Ошибка при загрузке аватара' });
  }
});

router.delete('/delete', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    await connection.query('DELETE FROM user_auth WHERE id = $1', [req.user.id]);
    res.json({ message: 'Аккаунт удален' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ message: 'Ошибка при удалении аккаунта' });
  }
});

// Employee Stats API
router.get('/employee-stats', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    const result = await connection.query(`
      SELECT u.id, u.first_name, u.last_name, u.avatar_url, 
             ROUND(COALESCE(AVG(s.rating), 0), 1) as rating, 
             COALESCE(SUM(s.calls), 0) as calls, 
             COALESCE(SUM(s.deals), 0) as deals, 
             COALESCE(SUM(s.plan), 0) as plan, 
             COALESCE(SUM(s.error), 0) as errors
      FROM user_auth u
      LEFT JOIN employees e ON u.id = e.user_id
      LEFT JOIN employee_stats s ON e.id = s.user_id
      WHERE u.role = 'employee' AND u.company_name = $1
      GROUP BY u.id, u.first_name, u.last_name, u.avatar_url
      ORDER BY rating DESC NULLS LAST
    `, [req.user.companyName]);
    res.json(result.rows);
  } catch (error) {
    console.error('Employee stats error:', error);
    res.status(500).json({ message: 'Ошибка загрузки аналитики сотрудников' });
  }
});

router.patch('/employee-stats/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ message: 'Нет доступа' });
    
    const { rating, calls, deals, plan, errors } = req.body;
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
    // Получаем employee_id для данного user_id
    const employeeResult = await connection.query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.params.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ message: 'Сотрудник не найден' });
    }
    
    const employeeId = employeeResult.rows[0].id;
    
    // Проверяем, существует ли запись в employee_stats
    const existingRecord = await connection.query(
      'SELECT id FROM employee_stats WHERE user_id = $1',
      [employeeId]
    );
    
    if (existingRecord.rows.length === 0) {
      // Создаем новую запись
      await connection.query(
        'INSERT INTO employee_stats (user_id, rating, calls, deals, plan, error) VALUES ($1, $2, $3, $4, $5, $6)',
        [employeeId, rating, calls, deals, plan, errors]
      );
    } else {
      // Обновляем существующую запись
    await connection.query(
        'UPDATE employee_stats SET rating = $1, calls = $2, deals = $3, plan = $4, error = $5 WHERE user_id = $6',
        [rating, calls, deals, plan, errors, employeeId]
    );
    }
    
    res.json({ message: 'Показатели обновлены' });
  } catch (error) {
    console.error('Employee stats update error:', error);
    res.status(500).json({ message: 'Ошибка обновления показателей' });
  }
});

// Get detailed employee statistics
router.get('/employee-detailed/:employeeId', auth, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    
        // Get employee basic info
    const employeeResult = await connection.query(`
      SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.email, u.role
      FROM user_auth u
      WHERE u.id = $1 AND u.company_name = $2
    `, [employeeId, req.user.companyName]);

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ message: 'Сотрудник не найден' });
    }

    const employee = employeeResult.rows[0];
    
    console.log('Employee query result:', employeeResult.rows);
    console.log('Employee data:', employee);

    // Get the correct employee_id from employees table
    const employeeIdResult = await connection.query(`
      SELECT id FROM employees WHERE user_id = $1
    `, [employeeId]);

    const correctEmployeeId = employeeIdResult.rows.length > 0 ? employeeIdResult.rows[0].id : employeeId;
    console.log('Correct employee_id for queries:', correctEmployeeId);

    // Get aggregated stats from employee_stats table
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
        ROUND(AVG(success_rate_percentage), 1) as avg_success_rate_percentage
      FROM employee_stats 
      WHERE user_id = $1
    `, [correctEmployeeId]);

    const stats = statsResult.rows[0] || {};

    // Get weekly trend data
    const weeklyResult = await connection.query(`
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
    `, [correctEmployeeId]);

    const weeklyTrend = weeklyResult.rows.reverse();

    // Get monthly trend data
    const monthlyResult = await connection.query(`
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
    `, [correctEmployeeId]);

    const monthlyTrend = monthlyResult.rows.reverse();

    // Get quality metrics for radar chart
    const qualityMetrics = {
      avgCallDuration: stats.avg_call_duration_minutes || 0,
      scriptCompliance: stats.avg_script_compliance_percentage || 0,
      keyPhrasesUsed: Math.min((stats.total_key_phrases_used || 0) * 10, 100), // Scale to 0-100
      stagesCompleted: stats.total_stages > 0 
        ? Math.round((stats.total_stages_completed / stats.total_stages) * 100) 
        : 0,
      successRate: stats.avg_success_rate_percentage || 0
    };

    // Merge employee data with stats
    const employeeWithStats = {
      ...employee,
      rating: stats.avg_rating || 0,
      calls: stats.total_calls || 0,
      deals: stats.total_deals || 0,
      plan: stats.total_plan || 0,
      error: stats.total_error || 0,
      avg_call_duration_minutes: stats.avg_call_duration_minutes || 0,
      script_compliance_percentage: stats.avg_script_compliance_percentage || 0,
      key_phrases_used: stats.total_key_phrases_used || 0,
      forbidden_phrases_count: stats.total_forbidden_phrases_count || 0,
      stages_completed: stats.total_stages_completed || 0,
      total_stages: stats.total_stages || 0,
      success_rate_percentage: stats.avg_success_rate_percentage || 0
    };

    const responseData = {
      employee: employeeWithStats,
      weeklyTrend,
      monthlyTrend,
      qualityMetrics
    };
    
    console.log('Sending employee detailed data:', responseData);
    
    res.json(responseData);
  } catch (error) {
    console.error('Error getting detailed employee stats:', error);
    res.status(500).json({ message: 'Ошибка получения детальной статистики' });
  }
});

module.exports = router; 