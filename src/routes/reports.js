const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const auth = require('../middleware/auth');
const combinedAuth = require('../middleware/combinedAuth');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

// Настройка S3 клиента для Яндекс.Облако
const s3Client = new S3Client({
  region: 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.YANDEX_ACCESS_KEY_ID,
    secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY
  }
});

// Функция для создания хранилища отчетов с динамической папкой компании
const createReportStorage = (companyName) => {
  return multerS3({
    s3: s3Client,
    bucket: process.env.YANDEX_BUCKET_NAME,
    key: (req, file, cb) => {
      const fileName = `logos-ai/companies/${companyName}/reports/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
    contentType: (req, file, cb) => {
      cb(null, file.mimetype);
    }
  });
};

const createReportUpload = (companyName) => {
  return multer({ storage: createReportStorage(companyName) });
};

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

router.post('/upload', combinedAuth, (req, res, next) => {
  const companyName = req.body.companyName || req.user.companyName || 'general';
  const upload = createReportUpload(companyName);
  upload.single('report')(req, res, next);
}, async (req, res) => {
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
    
    // Yandex Cloud S3 возвращает URL файла
    const file_url = req.file.location;
    console.log('Yandex Cloud S3 file URL:', file_url);
    
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

// Сохранение информации об отчете в базе данных (для прямой загрузки)
router.post('/save-report', auth, async (req, res) => {
  try {
    console.log('Save report request from user:', req.user);
    
    if (req.user.role !== 'manager') return res.status(403).json({ message: 'Нет доступа' });
    
    const { title, report_date, file_url } = req.body;
    const companyName = req.user.companyName;
    
    if (!title || !file_url) {
      return res.status(400).json({ message: 'Название и URL файла обязательны' });
    }
    
    console.log('Saving report:', { title, report_date, file_url, companyName });
    
    const connection = await DatabaseService.getCompanyConnection(companyName);
    await connection.query(
      'INSERT INTO departament_report (title, file_url, report_date, created_by) VALUES ($1, $2, $3, $4)',
      [title, file_url, report_date, req.user.id]
    );
    
    console.log('Report saved to database');
    res.json({ message: 'Отчёт сохранен', file_url });
  } catch (error) {
    console.error('Report save error:', error);
    res.status(500).json({ message: 'Ошибка сохранения отчёта' });
  }
});

module.exports = router;
