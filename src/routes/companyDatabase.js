const express = require('express');
const router = express.Router();
const CompanyDatabaseService = require('../services/companyDatabaseService');
const { validateCompanyName, ensureCompanyDatabase } = require('../middleware/companyDatabaseMiddleware');
const auth = require('../middleware/auth');

// List all company databases (admin only)
router.get('/list', auth, async (req, res) => {
  try {
    const databases = await CompanyDatabaseService.getAllCompanyDatabases();
    
    const companyList = databases.map(dbName => {
      const companyName = dbName.replace('logos_ai_', '');
      return {
        databaseName: dbName,
        companyName: companyName,
        sanitizedName: CompanyDatabaseService.sanitizeCompanyName(companyName)
      };
    });

    res.json({
      success: true,
      companies: companyList,
      total: companyList.length
    });
  } catch (error) {
    console.error('Error listing company databases:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error listing company databases' 
    });
  }
});

// Create a new company database
router.post('/create', auth, validateCompanyName, async (req, res) => {
  try {
    const { company_name } = req.body;
    
    // Check if database already exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(company_name);
    if (exists) {
      return res.status(400).json({
        success: false,
        message: `Database for company "${company_name}" already exists`
      });
    }

    // Create the database
    const databaseName = await CompanyDatabaseService.createCompanyDatabase(company_name);
    
    res.json({
      success: true,
      message: `Database created successfully for company: ${company_name}`,
      databaseName,
      companyName: company_name
    });
  } catch (error) {
    console.error('Error creating company database:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating company database' 
    });
  }
});

// Get company database statistics
router.get('/:companyName/stats', auth, ensureCompanyDatabase, async (req, res) => {
  try {
    const { companyName } = req.params;
    
    const stats = await CompanyDatabaseService.getCompanyStats(companyName);
    
    res.json({
      success: true,
      companyName,
      stats
    });
  } catch (error) {
    console.error('Error getting company database stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting company database statistics' 
    });
  }
});

// Check if company database exists
router.get('/:companyName/exists', async (req, res) => {
  try {
    const { companyName } = req.params;
    
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    
    res.json({
      success: true,
      exists,
      companyName
    });
  } catch (error) {
    console.error('Error checking company database existence:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking company database existence' 
    });
  }
});

// Delete company database (admin only, use with caution!)
router.delete('/:companyName', auth, async (req, res) => {
  try {
    const { companyName } = req.params;
    
    // Check if database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: `Database for company "${companyName}" does not exist`
      });
    }

    // Delete the database
    await CompanyDatabaseService.deleteCompanyDatabase(companyName);
    
    res.json({
      success: true,
      message: `Database deleted successfully for company: ${companyName}`
    });
  } catch (error) {
    console.error('Error deleting company database:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting company database' 
    });
  }
});

// Initialize company database (create if doesn't exist)
router.post('/:companyName/init', auth, validateCompanyName, async (req, res) => {
  try {
    const { companyName } = req.params;
    
    // Check if database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    
    if (exists) {
      return res.json({
        success: true,
        message: `Database for company "${companyName}" already exists`,
        databaseName: `logos_ai_${CompanyDatabaseService.sanitizeCompanyName(companyName)}`
      });
    }

    // Create the database
    const databaseName = await CompanyDatabaseService.createCompanyDatabase(companyName);
    
    res.json({
      success: true,
      message: `Database initialized successfully for company: ${companyName}`,
      databaseName,
      companyName
    });
  } catch (error) {
    console.error('Error initializing company database:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error initializing company database' 
    });
  }
});

module.exports = router; 