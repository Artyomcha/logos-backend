const DatabaseService = require('../services/databaseService');
const CompanyDatabaseService = require('../services/companyDatabaseService');
const { getUsersByCompany, getCompanyManagers, getCompanyEmployees } = require('../models/user');
const pool = require('../models/db');

// Get all companies (admin only)
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await DatabaseService.getAllCompanies();
    
    res.json({
      success: true,
      companies: companies.map(company => ({
        name: company.company_name,
        userCount: parseInt(company.user_count),
        createdAt: company.created_at
      }))
    });
  } catch (error) {
    console.error('Error getting all companies:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при получении списка компаний' 
    });
  }
};

// Get company details
exports.getCompanyDetails = async (req, res) => {
  try {
    const { companyName } = req.params;
    
    if (!companyName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Название компании обязательно' 
      });
    }

    const [stats, managers, employees] = await Promise.all([
      DatabaseService.getCompanyStats(companyName),
      getCompanyManagers(companyName),
      getCompanyEmployees(companyName)
    ]);

    res.json({
      success: true,
      company: {
        name: companyName,
        stats,
        managers: managers.map(manager => ({
          id: manager.id,
          email: manager.email,
          firstName: manager.first_name,
          lastName: manager.last_name,
          avatarUrl: manager.avatar_url,
          createdAt: manager.created_at
        })),
        employees: employees.map(employee => ({
          id: employee.id,
          email: employee.email,
          firstName: employee.first_name,
          lastName: employee.last_name,
          avatarUrl: employee.avatar_url,
          createdAt: employee.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error getting company details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при получении информации о компании' 
    });
  }
};

// Get company statistics
exports.getCompanyStats = async (req, res) => {
  try {
    const { companyName } = req.params;
    
    if (!companyName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Название компании обязательно' 
      });
    }

    // Check if company database exists, create if it doesn't
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    if (!exists) {
      await CompanyDatabaseService.createCompanyDatabase(companyName);
    }

    const stats = await CompanyDatabaseService.getCompanyStats(companyName);
    
    // Get additional statistics from company's database
    const employeeStats = await CompanyDatabaseService.executeCompanyQuery(companyName, `
      SELECT 
        AVG(es.rating) as avg_rating,
        SUM(es.calls) as total_calls,
        SUM(es.deals) as total_deals,
        SUM(es.plan) as total_plan,
        SUM(es.error) as total_errors
      FROM employee_stats es
      JOIN employees e ON es.id = e.id
      JOIN user_auth ua ON e.user_id = ua.id
    `);

    const overallDataStats = await CompanyDatabaseService.executeCompanyQuery(companyName, `
      SELECT 
        COUNT(*) as total_tasks,
        AVG(grade) as avg_grade
      FROM overall_data od
      JOIN employees e ON od.user_id = e.id
      JOIN user_auth ua ON e.user_id = ua.id
    `);

    res.json({
      success: true,
      stats: {
        ...stats,
        employeeStats: employeeStats.rows[0] || {
          avg_rating: 0,
          total_calls: 0,
          total_deals: 0,
          total_plan: 0,
          total_errors: 0
        },
        overallDataStats: overallDataStats.rows[0] || {
          total_tasks: 0,
          avg_grade: 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting company stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при получении статистики компании' 
    });
  }
};

// Check if company exists
exports.checkCompanyExists = async (req, res) => {
  try {
    const { companyName } = req.params;
    
    if (!companyName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Название компании обязательно' 
      });
    }

    // Check if company database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    
    res.json({
      success: true,
      exists,
      companyName
    });
  } catch (error) {
    console.error('Error checking company existence:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при проверке существования компании' 
    });
  }
};

// Get company activity summary
exports.getCompanyActivity = async (req, res) => {
  try {
    const { companyName } = req.params;
    const { period = '30' } = req.query; // days
    
    if (!companyName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Название компании обязательно' 
      });
    }

    // Check if company database exists, create if it doesn't
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    if (!exists) {
      await CompanyDatabaseService.createCompanyDatabase(companyName);
    }

    // Get recent activity data from company's database
    const recentActivity = await CompanyDatabaseService.executeCompanyQuery(companyName, `
      SELECT 
        'user_registration' as type,
        ua.created_at as date,
        ua.first_name || ' ' || ua.last_name as description
      FROM user_auth ua
      WHERE ua.created_at >= NOW() - INTERVAL '${period} days'
      
      UNION ALL
      
      SELECT 
        'employee_registration' as type,
        e.registed_at as date,
        e.first_name || ' ' || e.last_name as description
      FROM employees e
      JOIN user_auth ua ON e.user_id = ua.id
      WHERE e.registed_at >= NOW() - INTERVAL '${period} days'
      
      UNION ALL
      
      SELECT 
        'task_submission' as type,
        od.submitted_at as date,
        od.task_name as description
      FROM overall_data od
      JOIN employees e ON od.user_id = e.id
      JOIN user_auth ua ON e.user_id = ua.id
      WHERE od.submitted_at >= NOW() - INTERVAL '${period} days'
      
      UNION ALL
      
      SELECT 
        'dialogue_recorded' as type,
        d.recorded_at as date,
        d.task_name as description
      FROM dialogues d
      JOIN employees e ON d.user_id = e.id
      JOIN user_auth ua ON e.user_id = ua.id
      WHERE d.recorded_at >= NOW() - INTERVAL '${period} days'
      
      ORDER BY date DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      activity: recentActivity.rows
    });
  } catch (error) {
    console.error('Error getting company activity:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при получении активности компании' 
    });
  }
}; 