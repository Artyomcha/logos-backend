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

// Функция для создания хранилища с динамической папкой компании
const createAvatarStorage = (companyName) => {
  return multerS3({
    s3: s3Client,
    bucket: process.env.YANDEX_BUCKET_NAME,
    key: (req, file, cb) => {
      const fileName = `logos-ai/companies/${companyName}/avatars/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
    contentType: (req, file, cb) => {
      cb(null, file.mimetype);
    }
  });
};

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

const createFileStorage = (companyName) => {
  return multerS3({
    s3: s3Client,
    bucket: process.env.YANDEX_BUCKET_NAME,
    key: (req, file, cb) => {
      const fileName = `logos-ai/companies/${companyName}/files/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
    contentType: (req, file, cb) => {
      cb(null, file.mimetype);
    }
  });
};

// Middleware для создания динамического multer с папкой компании
const createAvatarUpload = (companyName) => {
  return multer({ storage: createAvatarStorage(companyName) });
};

const createReportUpload = (companyName) => {
  return multer({ storage: createReportStorage(companyName) });
};

const createFileUpload = (companyName) => {
  return multer({ storage: createFileStorage(companyName) });
};

// Динамический маршрут для регистрации с папкой компании
router.post('/register', (req, res, next) => {
  const companyName = req.body.companyName || 'general';
  const upload = createAvatarUpload(companyName);
  upload.single('avatar')(req, res, next);
}, authController.register);
router.post('/user-companies', authController.getUserCompanies);
router.post('/login', authController.login);
router.post('/verify-2fa', authController.verify2FA);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/verify-password-reset', authController.verifyPasswordReset);
router.get('/company/:companyName', authController.getCompanyInfo);

module.exports = router;