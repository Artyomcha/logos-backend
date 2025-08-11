const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');

// Simple admin authentication (you can enhance this later)
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
  next();
};

// Apply admin auth to all routes
router.use(adminAuth);

// List all companies
router.get('/companies', async (req, res) => {
  try {
    const companies = await DatabaseService.getAllCompanies();
    
    const companyList = companies.map(company => ({
      companyName: company.database_name.replace('logos_ai_', ''),
      databaseName: company.database_name,
      size: company.size,
      createdAt: company.created_at
    }));
    
    res.json({
      success: true,
      companies: companyList,
      total: companyList.length
    });
  } catch (error) {
    console.error('Error listing companies:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error listing companies' 
    });
  }
});

// Create a new company
router.post('/companies', async (req, res) => {
  try {
    const { companyName } = req.body;
    
    if (!companyName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company name is required' 
      });
    }
    
    // Check if company already exists
    const companies = await DatabaseService.getAllCompanies();
    const exists = companies.some(company => 
      company.database_name === `logos_ai_${companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    );
    
    if (exists) {
      return res.status(400).json({ 
        success: false, 
        message: `Company "${companyName}" already exists` 
      });
    }
    
    // Create the company database
    const dbName = await DatabaseService.createCompanyDatabase(companyName);
    
    res.json({
      success: true,
      message: `Company "${companyName}" created successfully`,
      companyName,
      databaseName: dbName,
      nextSteps: {
        managerRegistration: 'POST /api/auth/register',
        managerData: {
          companyName,
          role: 'manager'
        }
      }
    });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating company' 
    });
  }
});

// Delete a company
router.delete('/companies/:companyName', async (req, res) => {
  try {
    const { companyName } = req.params;
    
    if (!companyName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company name is required' 
      });
    }
    
    // Check if company exists
    const companies = await DatabaseService.getAllCompanies();
    const exists = companies.some(company => 
      company.database_name === `logos_ai_${companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    );
    
    if (!exists) {
      return res.status(404).json({ 
        success: false, 
        message: `Company "${companyName}" not found` 
      });
    }
    
    // Delete the company database
    await DatabaseService.deleteCompanyDatabase(companyName);
    
    res.json({
      success: true,
      message: `Company "${companyName}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting company' 
    });
  }
});

// Get company status and statistics
router.get('/companies/:companyName/status', async (req, res) => {
  try {
    const { companyName } = req.params;
    
    if (!companyName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company name is required' 
      });
    }
    
    const status = await DatabaseService.checkCompanyDatabaseStatus(companyName);
    const stats = await DatabaseService.getCompanyStats(companyName);
    
    res.json({
      success: true,
      companyName,
      status,
      stats
    });
  } catch (error) {
    console.error('Error getting company status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting company status' 
    });
  }
});

module.exports = router; 