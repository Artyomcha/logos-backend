const CompanyDatabaseService = require('../services/companyDatabaseService');

/**
 * Middleware to ensure company database exists before processing requests
 */
const ensureCompanyDatabase = async (req, res, next) => {
  try {
    const companyName = req.body.company_name || req.params.company_name || req.query.company_name;
    
    if (!companyName) {
      return res.status(400).json({ 
        error: 'Company name is required' 
      });
    }

    // Check if company database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    
    if (!exists) {
      // Create the database automatically
      console.log(`Auto-creating database for company: ${companyName}`);
      await CompanyDatabaseService.createCompanyDatabase(companyName);
      console.log(`✅ Database created for company: ${companyName}`);
    }

    // Add company name to request for use in controllers
    req.companyName = companyName;
    next();
  } catch (error) {
    console.error('Error in company database middleware:', error);
    res.status(500).json({ 
      error: 'Failed to ensure company database exists' 
    });
  }
};

/**
 * Middleware to validate company name format
 */
const validateCompanyName = (req, res, next) => {
  const companyName = req.body.company_name || req.params.company_name || req.query.company_name;
  
  if (!companyName) {
    return res.status(400).json({ 
      error: 'Company name is required' 
    });
  }

  // Basic validation - company name should be 2-50 characters
  if (companyName.length < 2 || companyName.length > 50) {
    return res.status(400).json({ 
      error: 'Company name must be between 2 and 50 characters' 
    });
  }

  // Check for invalid characters
  const invalidChars = /[<>:"/\\|?*]/;
  if (invalidChars.test(companyName)) {
    return res.status(400).json({ 
      error: 'Company name contains invalid characters' 
    });
  }

  next();
};

/**
 * Middleware to get company database connection
 */
const getCompanyDatabase = async (req, res, next) => {
  try {
    const companyName = req.companyName;
    
    if (!companyName) {
      return res.status(400).json({ 
        error: 'Company name not found in request' 
      });
    }

    // Get the company's database pool
    const pool = CompanyDatabaseService.getCompanyPool(companyName);
    req.companyDb = pool;
    req.executeCompanyQuery = (query, params) => CompanyDatabaseService.executeCompanyQuery(companyName, query, params);
    
    next();
  } catch (error) {
    console.error('Error getting company database:', error);
    res.status(500).json({ 
      error: 'Failed to connect to company database' 
    });
  }
};

module.exports = {
  ensureCompanyDatabase,
  validateCompanyName,
  getCompanyDatabase
}; 