const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DatabaseService = require('../services/databaseService');
const auth = require('../middleware/auth');
const combinedAuth = require('../middleware/combinedAuth');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Простое локальное хранилище для файлов
const fileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const companyName = req.user?.companyName || 'general';
    const uploadPath = path.join(__dirname, '../../uploads/companies', companyName, 'files');
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
  storage: fileStorage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Генерация presigned URL для загрузки аватара
router.post('/avatar-upload-url', auth, async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    const companyName = req.user.companyName || 'general';
    
    if (!fileName || !fileType) {
      return res.status(400).json({ message: 'Имя файла и тип обязательны' });
    }

    const key = `logos-ai/companies/${companyName}/avatars/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.YANDEX_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Metadata: {
        'company-name': companyName,
        'user-id': req.user.id.toString()
      }
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 час

    res.json({
      uploadUrl: presignedUrl,
      fileUrl: `https://storage.yandexcloud.net/${process.env.YANDEX_BUCKET_NAME}/${key}`,
      key: key
    });
  } catch (error) {
    console.error('Error generating avatar upload URL:', error);
    res.status(500).json({ message: 'Ошибка генерации ссылки для загрузки' });
  }
});

// Генерация presigned URL для загрузки отчета
router.post('/report-upload-url', combinedAuth, async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    const companyName = req.body.companyName || req.user.companyName || 'general';
    
    if (!fileName || !fileType) {
      return res.status(400).json({ message: 'Имя файла и тип обязательны' });
    }

    if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const key = `logos-ai/companies/${companyName}/reports/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.YANDEX_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Metadata: {
        'company-name': companyName,
        'user-id': req.user.id.toString(),
        'file-type': 'report'
      }
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 час

    res.json({
      uploadUrl: presignedUrl,
      fileUrl: `https://storage.yandexcloud.net/${process.env.YANDEX_BUCKET_NAME}/${key}`,
      key: key
    });
  } catch (error) {
    console.error('Error generating report upload URL:', error);
    res.status(500).json({ message: 'Ошибка генерации ссылки для загрузки' });
  }
});

// Генерация presigned URL для загрузки общих файлов
router.post('/file-upload-url', combinedAuth, async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    const companyName = req.body.companyName || req.user.companyName || 'general';
    
    if (!fileName || !fileType) {
      return res.status(400).json({ message: 'Имя файла и тип обязательны' });
    }

    const key = `logos-ai/companies/${companyName}/files/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.YANDEX_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Metadata: {
        'company-name': companyName,
        'user-id': req.user.id.toString(),
        'file-type': 'general'
      }
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 час

    res.json({
      uploadUrl: presignedUrl,
      fileUrl: `https://storage.yandexcloud.net/${process.env.YANDEX_BUCKET_NAME}/${key}`,
      key: key
    });
  } catch (error) {
    console.error('Error generating file upload URL:', error);
    res.status(500).json({ message: 'Ошибка генерации ссылки для загрузки' });
  }
});

// Генерация presigned URL для скачивания файла
router.post('/download-url', auth, async (req, res) => {
  try {
    const { fileUrl } = req.body;
    
    if (!fileUrl) {
      return res.status(400).json({ message: 'URL файла обязателен' });
    }

    // Извлекаем ключ из URL
    const urlParts = fileUrl.split('/');
    const key = urlParts.slice(-2).join('/'); // Берем последние 2 части пути
    
    const command = new GetObjectCommand({
      Bucket: process.env.YANDEX_BUCKET_NAME,
      Key: key
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 час

    res.json({ downloadUrl: presignedUrl });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ message: 'Ошибка генерации ссылки для скачивания' });
  }
});

// Загрузка файла
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    console.log('File upload request for company:', req.user.companyName);
    console.log('File received:', req.file ? req.file.originalname : 'no file');
    
    if (!req.file) return res.status(400).json({ message: 'Файл не загружен' });
    
    const file_url = `/uploads/companies/${req.user.companyName}/files/${req.file.filename}`;
    console.log('File URL:', file_url);
    
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    console.log('Database connection established for upload');
    
    const result = await connection.query(
      'INSERT INTO uploaded_files (original_name, file_url, upload_date, uploaded_by) VALUES ($1, $2, NOW(), $3) RETURNING *',
      [req.file.originalname, file_url, req.user.id]
    );
    console.log('File saved to database:', result.rows[0]);
    
    res.json({ message: 'Файл загружен', file: result.rows[0] });
  } catch (err) {
    console.error('Ошибка при загрузке файла:', err);
    res.status(500).json({ message: 'Ошибка сервера', error: err.message });
  }
});

// Получить список файлов
router.get('/list', auth, async (req, res) => {
  try {
    console.log('Getting uploaded files for company:', req.user.companyName);
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    console.log('Database connection established');
    const result = await connection.query('SELECT * FROM uploaded_files ORDER BY upload_date DESC');
    console.log('Query executed, found', result.rows.length, 'files');
  res.json(result.rows);
  } catch (error) {
    console.error('Error getting uploaded files:', error);
    res.status(500).json({ 
      message: 'Ошибка получения списка файлов',
      error: error.message,
      companyName: req.user.companyName 
    });
  }
});

// Удалить файл
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await DatabaseService.getCompanyConnection(req.user.companyName);
    const result = await connection.query('SELECT * FROM uploaded_files WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Файл не найден' });
    const file = result.rows[0];
    const filePath = path.join(__dirname, '../../', file.file_url);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
    await connection.query('DELETE FROM uploaded_files WHERE id = $1', [id]);
    res.json({ message: 'Файл удалён' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Ошибка удаления файла' });
  }
});

// Сохранение информации о файле в базе данных (для прямой загрузки)
router.post('/save-file', auth, async (req, res) => {
  try {
    console.log('Save file request from user:', req.user);
    
    const { original_name, file_url } = req.body;
    const companyName = req.user.companyName;
    
    if (!original_name || !file_url) {
      return res.status(400).json({ message: 'Имя файла и URL обязательны' });
    }
    
    console.log('Saving file:', { original_name, file_url, companyName });
    
    const connection = await DatabaseService.getCompanyConnection(companyName);
    await connection.query(
      'INSERT INTO uploaded_files (original_name, file_url, uploaded_by) VALUES ($1, $2, $3)',
      [original_name, file_url, req.user.id]
    );
    
    console.log('File saved to database');
    res.json({ message: 'Файл сохранен', file_url });
  } catch (error) {
    console.error('File save error:', error);
    res.status(500).json({ message: 'Ошибка сохранения файла' });
  }
});

module.exports = router;