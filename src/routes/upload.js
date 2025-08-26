const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DatabaseService = require('../services/databaseService');
const auth = require('../middleware/auth');
const combinedAuth = require('../middleware/combinedAuth');


const SAFE_AUDIO_MIME = new Set(['audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/webm','audio/mp4']);
const SAFE_DOC_MIME = new Set(['application/pdf','image/png','image/jpeg']);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function hasDoubleExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 2;
}
function getSafeExt(original) {
  const ext = path.extname(original || '').toLowerCase();
  const allowed = new Set(['.wav','.mp3','.ogg','.webm','.m4a','.pdf','.png','.jpg','.jpeg']);
  return allowed.has(ext) ? ext : '';
}

// Безопасное локальное хранилище для файлов
const fileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const rawCompany = req.user?.companyName || 'general';
    const companyName = String(rawCompany).replace(/[^a-zA-Z0-9_-]/g,''); // sanitize
    const uploadPath = path.join('/app/uploads/companies', companyName, 'files');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const safeExt = getSafeExt(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'file-' + uniqueSuffix + safeExt);
  }
});

const upload = multer({
  storage: fileStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1, parts: 2 },
  fileFilter: (req, file, cb) => {
    const mimetype = (file.mimetype || '').toLowerCase();
    const name = file.originalname || '';
    if (hasDoubleExtension(name)) return cb(new Error('Запрещены двойные расширения'), false);

    const isAudio = SAFE_AUDIO_MIME.has(mimetype);
    const isDocImg = SAFE_DOC_MIME.has(mimetype);
    if (!isAudio && !isDocImg) return cb(new Error('Недопустимый тип файла'), false);

    const ext = getSafeExt(name);
    if (!ext) return cb(new Error('Недопустимое расширение файла'), false);

    cb(null, true);
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

// Обработка ошибок multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Файл слишком большой' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Слишком много файлов' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Неожиданное поле файла' });
    }
    return res.status(400).json({ message: 'Ошибка загрузки файла' });
  }
  
  if (error.message) {
    return res.status(400).json({ message: error.message });
  }
  
  next(error);
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