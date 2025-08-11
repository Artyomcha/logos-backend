const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DatabaseService = require('../services/databaseService');
const auth = require('../middleware/auth');

// Динамическая настройка multer для загрузки в компанейские папки
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const companyName = req.user.companyName || 'general';
    const uploadPath = path.join(__dirname, '../../uploads/companies', companyName, 'files');
    // Создаем папку если не существует
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
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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

module.exports = router;