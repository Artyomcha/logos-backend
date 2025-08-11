const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const auth = require('../middleware/auth');
const combinedAuth = require('../middleware/combinedAuth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const upload = multer({
  dest: path.join(__dirname, '../../uploads/reports'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/', auth, async (req, res) => {
  try {
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    const result = await connection.query(
      'SELECT * FROM departament_report ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Reports fetch error:', error);
    res.status(500).json({ message: 'Ошибка загрузки отчётов' });
  }
});

router.post('/upload', combinedAuth, upload.single('report'), async (req, res) => {
  try {
    console.log('Upload request from user:', req.user);
    
    if (req.user.role !== 'manager') return res.status(403).json({ message: 'Нет доступа' });
    
    const { title, report_date, report_data, companyName: bodyCompanyName } = req.body;
    const finalReportDate = report_date || report_data;
    if (!req.file) return res.status(400).json({ message: 'Файл не загружен' });
    
    // Получаем название компании из разных источников
    const companyName = bodyCompanyName || req.user.companyName;
    if (!companyName) return res.status(400).json({ message: 'Название компании обязательно' });
    
    console.log('Request body:', req.body);
    console.log('Title:', title);
    console.log('Report date from request:', report_date);
    console.log('Report data from request:', report_data);
    console.log('Final report date:', finalReportDate);
    console.log('Company name from request:', companyName);
    console.log('File uploaded:', req.file.originalname);
    
    const ext = path.extname(req.file.originalname).toLowerCase();
    const newName = `report_${Date.now()}${ext}`;
    const companyReportsDir = path.join(__dirname, '../../uploads/companies', companyName, 'reports');
    
    console.log('Company reports directory:', companyReportsDir);
    
    if (!fs.existsSync(companyReportsDir)) {
      console.log('Creating directory:', companyReportsDir);
      fs.mkdirSync(companyReportsDir, { recursive: true });
    }
    
    const newPath = path.join(companyReportsDir, newName);
    console.log('Moving file to:', newPath);
    fs.renameSync(req.file.path, newPath);
    
    const file_url = `/uploads/companies/${companyName}/reports/${newName}`;
    console.log('File URL:', file_url);
    
    const connection = await DatabaseService.getCompanyConnection(companyName);
    await connection.query(
      'INSERT INTO departament_report (title, file_url, report_date, created_by) VALUES ($1, $2, $3, $4)',
      [title, file_url, finalReportDate, req.user.id]
    );
    
    console.log('Report saved to database');
    res.json({ message: 'Отчёт загружен', file_url });
  } catch (error) {
    console.error('Report upload error:', error);
    res.status(500).json({ message: 'Ошибка загрузки отчёта' });
  }
});

module.exports = router;
