const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const auth = require('../middleware/auth');

// Get all companies (admin only)
router.get('/all', auth, companyController.getAllCompanies);

// Get company details
router.get('/:companyName', auth, companyController.getCompanyDetails);

// Get company statistics
router.get('/:companyName/stats', auth, companyController.getCompanyStats);

// Check if company exists
router.get('/:companyName/exists', companyController.checkCompanyExists);

// Get company activity
router.get('/:companyName/activity', auth, companyController.getCompanyActivity);

module.exports = router; 