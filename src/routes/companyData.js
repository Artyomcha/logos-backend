const express = require('express');
const router = express.Router();
const CompanyDatabaseService = require('../services/companyDatabaseService');
const { 
  ensureCompanyAccess, 
  ensureUserBelongsToCompany, 
  ensureManagerAccess,
  setCompanyContext 
} = require('../middleware/companyIsolationMiddleware');
const auth = require('../middleware/auth');

// Apply company context to all routes
router.use(setCompanyContext);

// Get company overview (managers only)
router.get('/overview', auth, ensureCompanyAccess, ensureManagerAccess, async (req, res) => {
  try {
    const { companyName } = req;
    
    const [stats, managers, employees, recentActivity] = await Promise.all([
      CompanyDatabaseService.getCompanyStats(companyName),
      CompanyDatabaseService.getCompanyManagers(companyName),
      CompanyDatabaseService.getCompanyEmployees(companyName),
      CompanyDatabaseService.getCompanyActivity(companyName, 7) // Last 7 days
    ]);

    res.json({
      success: true,
      company: {
        name: companyName,
        stats,
        managers: managers.length,
        employees: employees.length,
        recentActivity: recentActivity.length
      }
    });
  } catch (error) {
    console.error('Error getting company overview:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company overview'
    });
  }
});

// Get all company users (managers and employees)
router.get('/users', auth, ensureCompanyAccess, ensureManagerAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const users = await CompanyDatabaseService.getCompanyUsers(companyName);

    res.json({
      success: true,
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at,
        avatarUrl: user.avatar_url,
        employeeId: user.employee_id,
        employeeRegisteredAt: user.employee_registered_at
      }))
    });
  } catch (error) {
    console.error('Error getting company users:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company users'
    });
  }
});

// Get company managers
router.get('/managers', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const managers = await CompanyDatabaseService.getCompanyManagers(companyName);

    res.json({
      success: true,
      managers: managers.map(manager => ({
        id: manager.id,
        email: manager.email,
        firstName: manager.first_name,
        lastName: manager.last_name,
        createdAt: manager.created_at,
        avatarUrl: manager.avatar_url
      }))
    });
  } catch (error) {
    console.error('Error getting company managers:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company managers'
    });
  }
});

// Get company employees
router.get('/employees', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const employees = await CompanyDatabaseService.getCompanyEmployees(companyName);

    res.json({
      success: true,
      employees: employees.map(employee => ({
        id: employee.id,
        email: employee.email,
        firstName: employee.first_name,
        lastName: employee.last_name,
        createdAt: employee.created_at,
        avatarUrl: employee.avatar_url,
        employeeId: employee.employee_id,
        employeeRegisteredAt: employee.employee_registered_at,
        stats: {
          rating: employee.rating,
          calls: employee.calls,
          deals: employee.deals,
          plan: employee.plan,
          error: employee.error
        }
      }))
    });
  } catch (error) {
    console.error('Error getting company employees:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company employees'
    });
  }
});

// Get employee performance statistics
router.get('/employee-stats', auth, ensureCompanyAccess, ensureManagerAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const employeeStats = await CompanyDatabaseService.getCompanyEmployeeStats(companyName);

    res.json({
      success: true,
      employeeStats: employeeStats.map(stat => ({
        id: stat.id,
        firstName: stat.first_name,
        lastName: stat.last_name,
        email: stat.email,
        rating: stat.rating,
        calls: stat.calls,
        deals: stat.deals,
        plan: stat.plan,
        error: stat.error,
        updatedAt: stat.updated_at
      }))
    });
  } catch (error) {
    console.error('Error getting employee stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting employee statistics'
    });
  }
});

// Get company tasks
router.get('/tasks', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const tasks = await CompanyDatabaseService.getCompanyTasks(companyName);

    res.json({
      success: true,
      tasks: tasks.map(task => ({
        id: task.id,
        taskName: task.task_name,
        grade: task.grade,
        report: task.report,
        submittedAt: task.submitted_at,
        employee: {
          firstName: task.first_name,
          lastName: task.last_name,
          email: task.email
        }
      }))
    });
  } catch (error) {
    console.error('Error getting company tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company tasks'
    });
  }
});

// Get company dialogues
router.get('/dialogues', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const dialogues = await CompanyDatabaseService.getCompanyDialogues(companyName);

    res.json({
      success: true,
      dialogues: dialogues.map(dialogue => ({
        id: dialogue.id,
        taskName: dialogue.task_name,
        fullDialogue: dialogue.full_dialogue,
        recordedAt: dialogue.recorded_at,
        employee: {
          firstName: dialogue.first_name,
          lastName: dialogue.last_name,
          email: dialogue.email
        }
      }))
    });
  } catch (error) {
    console.error('Error getting company dialogues:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company dialogues'
    });
  }
});

// Get company reports
router.get('/reports', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const reports = await CompanyDatabaseService.getCompanyReports(companyName);

    res.json({
      success: true,
      reports: reports.map(report => ({
        id: report.id,
        title: report.title,
        fileUrl: report.file_url,
        createdAt: report.created_at,
        createdBy: {
          firstName: report.first_name,
          lastName: report.last_name,
          email: report.email
        }
      }))
    });
  } catch (error) {
    console.error('Error getting company reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company reports'
    });
  }
});

// Get company files
router.get('/files', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const files = await CompanyDatabaseService.getCompanyFiles(companyName);

    res.json({
      success: true,
      files: files.map(file => ({
        id: file.id,
        originalName: file.original_name,
        fileUrl: file.file_url,
        uploadDate: file.upload_date,
        uploadedBy: {
          firstName: file.first_name,
          lastName: file.last_name,
          email: file.email
        }
      }))
    });
  } catch (error) {
    console.error('Error getting company files:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company files'
    });
  }
});

// Get company activity
router.get('/activity', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const { period = 30 } = req.query;
    
    const activity = await CompanyDatabaseService.getCompanyActivity(companyName, parseInt(period));

    res.json({
      success: true,
      activity: activity.map(item => ({
        type: item.type,
        date: item.date,
        description: item.description,
        userRole: item.user_role
      }))
    });
  } catch (error) {
    console.error('Error getting company activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company activity'
    });
  }
});

// Get company statistics
router.get('/stats', auth, ensureCompanyAccess, async (req, res) => {
  try {
    const { companyName } = req;
    const stats = await CompanyDatabaseService.getCompanyStats(companyName);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting company stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting company statistics'
    });
  }
});

module.exports = router; 