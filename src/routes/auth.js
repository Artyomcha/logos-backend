const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const multer = require('multer');
const path = require('path');
// Динамическая настройка multer для загрузки в компанейские папки
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const companyName = req.body.companyName || 'general';
    const uploadPath = path.join(__dirname, '../../uploads/companies', companyName, 'avatars');
    // Создаем папку если не существует
    const fs = require('fs');
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
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.post('/register', upload.single('avatar'), authController.register);
router.post('/user-companies', authController.getUserCompanies);
router.post('/login', authController.login);
router.post('/verify-2fa', authController.verify2FA);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/verify-password-reset', authController.verifyPasswordReset);
router.get('/company/:companyName', authController.getCompanyInfo);

module.exports = router;