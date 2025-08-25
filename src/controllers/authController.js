const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUserByEmail, createUser, getUsersByCompany, updateUser } = require('../models/user');
const { send2FACode, sendLoginCredentials, sendPasswordResetCode } = require('../services/email');
const CompanyDatabaseService = require('../services/companyDatabaseService');
const DatabaseService = require('../services/databaseService');
const path = require('path');
const fs = require('fs');

const codes = new Map(); // email -> code (in-memory, для демо)

// Добавляем Map для хранения кодов сброса пароля
const resetCodes = new Map(); // email -> { code, companyName, expiresAt }

exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, companyName } = req.body;
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ message: 'Все обязательные поля должны быть заполнены' });
    }

    // Company name is required for managers
    if (role === 'manager' && !companyName) {
      return res.status(400).json({ message: 'Название компании обязательно для менеджера' });
    }

    // For employees, company name is optional (will be set by manager)
    const finalCompanyName = companyName || 'default';

    // Check if user already exists in the company database
    try {
      const existing = await getUserByEmail(email, finalCompanyName);
      if (existing) {
        return res.status(400).json({ message: 'Пользователь уже существует в этой компании' });
      }
    } catch (error) {
      // Database might not exist yet, which is fine for new companies
    }

    // Validate role
    const validRoles = ['employee', 'manager', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Неверная роль пользователя' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Handle avatar upload
    let avatarUrl = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const newName = `avatar_${Date.now()}${ext}`;
      const newPath = path.join(req.file.destination, newName);
      fs.renameSync(req.file.path, newPath);
      avatarUrl = `/uploads/companies/${finalCompanyName}/avatars/${newName}`;
    }

    // Create company database if it doesn't exist (for managers)
    if (role === 'manager') {
      await CompanyDatabaseService.createCompanyDatabase(finalCompanyName);
    }

    // Create user in company database
    const user = await createUser({ 
      email, 
      passwordHash, 
      firstName, 
      lastName, 
      avatarUrl, 
      role, 
      companyName: finalCompanyName 
    });

    // If user is employee, create employee record and stats
    if (role === 'employee') {
      // Create employee record
      const employeeResult = await CompanyDatabaseService.executeCompanyQuery(finalCompanyName, `
        INSERT INTO employees (user_id, first_name, last_name) 
        VALUES ($1, $2, $3) RETURNING id
      `, [user.id, firstName, lastName]);
      
      const employeeId = employeeResult.rows[0].id;
      
      // Create initial employee stats record
      await CompanyDatabaseService.executeCompanyQuery(finalCompanyName, `
        INSERT INTO employee_stats (user_id, rating, calls, deals, plan, error) 
        VALUES ($1, 0, 0, 0, 0, 0)
      `, [employeeId]);
    }

    // Send email with login credentials
    try {
      await sendLoginCredentials(email, email, password, finalCompanyName, firstName, lastName);
    } catch (emailError) {
      console.error('Error sending login credentials email:', emailError);
      // Не прерываем регистрацию, если email не отправился
    }

    res.json({ 
      id: user.id, 
      email: user.email, 
      role: user.role, 
      companyName: user.company_name,
      avatarUrl: user.avatar_url,
      message: 'Пользователь создан успешно. Данные для входа отправлены на email.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Ошибка при регистрации' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, companyName } = req.body;
    
    console.log('Login request:', { email, password: password ? '***' : 'empty', companyName });
    
    if (!email || !password) {
      console.log('Missing email or password:', { email: !!email, password: !!password });
      return res.status(400).json({ message: 'Email и пароль обязательны' });
    }

    // Try to find user in the specified company database
    let user = null;
    let foundCompany = null;

    if (companyName) {
      try {
        user = await getUserByEmail(email, companyName);
        if (user) {
          foundCompany = companyName;
        }
      } catch (error) {
        // Company database might not exist
      }
    } else {
      // If no company specified, try to find user in any company database
      const companies = await CompanyDatabaseService.getAllCompanyDatabases();
      
      for (const databaseName of companies) {
        try {
          const companyName = databaseName.replace('logos_ai_', '');
          user = await getUserByEmail(email, companyName);
          if (user) {
            foundCompany = companyName;
            break;
          }
        } catch (error) {
          // Continue searching in other companies
        }
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Неверные данные или компания не найдена' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Неверные данные' });
    }

    // Generate and send 2FA code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('Generated 2FA code for', email, ':', code);
    codes.set(email, { code, companyName: foundCompany });
    console.log('Stored codes:', Array.from(codes.entries()));
    await send2FACode(email, code);
    
    res.json({ 
      message: 'Код отправлен на email',
      companyName: foundCompany
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Ошибка при входе' });
  }
};

exports.verify2FA = async (req, res) => {
  try {
    const { email, code } = req.body;
    console.log('2FA verification request:', { email, code });
    const stored = codes.get(email);
    console.log('Stored data for', email, ':', stored);
    console.log('All stored codes:', Array.from(codes.entries()));
    
    if (!stored || stored.code !== code) {
      console.log('2FA verification failed:', { 
        hasStored: !!stored, 
        storedCode: stored?.code, 
        providedCode: code,
        match: stored?.code === code 
      });
      return res.status(401).json({ message: 'Неверный код' });
    }
    
    codes.delete(email);
    
    const user = await getUserByEmail(email, stored.companyName);
    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role, 
        companyName: user.company_name 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    res.json({ 
      token, 
      role: user.role, 
      companyName: user.company_name,
      userId: user.id
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ message: 'Ошибка при верификации' });
  }
};

// New endpoint to get company information
exports.getCompanyInfo = async (req, res) => {
  try {
    const { companyName } = req.params;
    
    if (!companyName) {
      return res.status(400).json({ message: 'Название компании обязательно' });
    }

    // Check if company database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    if (!exists) {
      return res.status(404).json({ message: 'Компания не найдена' });
    }

    const stats = await CompanyDatabaseService.getCompanyStats(companyName);
    const users = await getUsersByCompany(companyName);
    
    res.json({
      companyName,
      stats,
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }))
    });
  } catch (error) {
    console.error('Get company info error:', error);
    res.status(500).json({ message: 'Ошибка при получении информации о компании' });
  }
}; 

// Get user companies by email
exports.getUserCompanies = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email обязателен' });
    }

    const companies = await DatabaseService.getUserCompanies(email);
    res.json({ companies });
  } catch (error) {
    console.error('Error getting user companies:', error);
    res.status(500).json({ message: 'Ошибка получения списка компаний' });
  }
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email обязателен' });
    }

    // Ищем пользователя во всех компаниях
    const companies = await DatabaseService.getUserCompanies(email);
    
    if (companies.length === 0) {
      return res.status(404).json({ message: 'Пользователь с таким email не найден' });
    }

    if (companies.length > 1) {
      return res.status(400).json({ 
        message: 'Пользователь найден в нескольких компаниях. Пожалуйста, укажите компанию.',
        companies: companies.map(c => c.companyName)
      });
    }

    const companyName = companies[0].companyName;

    // Генерируем код сброса (действителен 10 минут)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 минут
    
    resetCodes.set(email, { code, companyName, expiresAt });
    
    // Отправляем код на email
    await sendPasswordResetCode(email, code);
    
    res.json({ message: 'Код для сброса пароля отправлен на email' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Ошибка при запросе сброса пароля' });
  }
};

exports.verifyPasswordReset = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }

    const stored = resetCodes.get(email);
    
    if (!stored) {
      return res.status(400).json({ message: 'Код не найден или истек' });
    }

    if (stored.code !== code) {
      return res.status(400).json({ message: 'Неверный код' });
    }

    if (Date.now() > stored.expiresAt) {
      resetCodes.delete(email);
      return res.status(400).json({ message: 'Код истек' });
    }

    // Получаем пользователя для обновления
    const user = await getUserByEmail(email, stored.companyName);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Хешируем новый пароль
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Обновляем пароль пользователя
    await updateUser(user.id, { password_hash: newPasswordHash }, stored.companyName);
    
    // Удаляем использованный код
    resetCodes.delete(email);
    
    res.json({ message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Password reset verification error:', error);
    res.status(500).json({ message: 'Ошибка при сбросе пароля' });
  }
};