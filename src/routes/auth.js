const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
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

// Простое хранилище S3 для аватаров
const avatarStorage = multerS3({
  s3: s3Client,
  bucket: process.env.YANDEX_BUCKET_NAME,
  key: (req, file, cb) => {
    const companyName = req.body.companyName || 'general';
    const fileName = `uploads/companies/${companyName}/avatars/${Date.now()}-${file.originalname}`;
    cb(null, fileName);
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