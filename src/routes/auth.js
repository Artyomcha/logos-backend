const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Простое локальное хранилище для аватаров
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const companyName = req.body.companyName || 'general';
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

const avatarUpload = multer({ storage: avatarStorage });

router.post('/register', avatarUpload.single('avatar'), authController.register);
router.post('/user-companies', authController.getUserCompanies);
router.post('/login', authController.login);
router.post('/verify-2fa', authController.verify2FA);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/verify-password-reset', authController.verifyPasswordReset);
router.get('/company/:companyName', authController.getCompanyInfo);

module.exports = router;