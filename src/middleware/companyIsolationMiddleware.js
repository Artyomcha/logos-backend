const CompanyDatabaseService = require('../services/companyDatabaseService');

/**
 * Middleware to ensure user can only access their own company's data
 */
const ensureCompanyAccess = async (req, res, next) => {
  try {
    const userCompany = req.user?.company_name;
    const requestedCompany = req.params.companyName || req.body.company_name || req.query.company_name;

    if (!userCompany) {
      return res.status(403).json({
        success: false,
        message: 'User company not found'
      });
    }

    if (!requestedCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company name is required'
      });
    }

    // Users can only access their own company's data
    if (userCompany !== requestedCompany) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only access your own company data'
      });
    }

    // Ensure company database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(userCompany);
    if (!exists) {
      await CompanyDatabaseService.createCompanyDatabase(userCompany);
    }

    req.companyName = userCompany;
    next();
  } catch (error) {
    console.error('Error in company access middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking company access'
    });
  }
};

/**
 * Middleware to ensure user belongs to the company they're trying to access
 */
const ensureUserBelongsToCompany = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const companyName = req.companyName || req.params.companyName;

    if (!userId || !companyName) {
      return res.status(400).json({
        success: false,
        message: 'User ID and company name are required'
      });
    }

    const belongsToCompany = await CompanyDatabaseService.userBelongsToCompany(companyName, userId);
    
    if (!belongsToCompany) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: User does not belong to this company'
      });
    }

    next();
  } catch (error) {
    console.error('Error checking user company membership:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking user company membership'
    });
  }
};

/**
 * Middleware to ensure manager access for sensitive operations
 */
const ensureManagerAccess = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const companyName = req.companyName;

    if (!userId || !companyName) {
      return res.status(400).json({
        success: false,
        message: 'User ID and company name are required'
      });
    }

    // Check if user is a manager in this company
    const result = await CompanyDatabaseService.executeCompanyQuery(companyName, `
      SELECT role FROM user_auth WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0 || result.rows[0].role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Manager privileges required'
      });
    }

    next();
  } catch (error) {
    console.error('Error checking manager access:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking manager access'
    });
  }
};

/**
 * Middleware to ensure admin access for system-wide operations
 */
const ensureAdminAccess = async (req, res, next) => {
  try {
    const userRole = req.user?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Admin privileges required'
      });
    }

    next();
  } catch (error) {
    console.error('Error checking admin access:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking admin access'
    });
  }
};

/**
 * Middleware to set company context for all requests
 */
const setCompanyContext = async (req, res, next) => {
  try {
    const userCompany = req.user?.company_name;
    
    if (userCompany) {
      // Ensure company database exists
      const exists = await CompanyDatabaseService.companyDatabaseExists(userCompany);
      if (!exists) {
        await CompanyDatabaseService.createCompanyDatabase(userCompany);
      }
      
      req.companyName = userCompany;
      req.executeCompanyQuery = (query, params) => 
        CompanyDatabaseService.executeCompanyQuery(userCompany, query, params);
    }

    next();
  } catch (error) {
    console.error('Error setting company context:', error);
    next(); // Continue even if there's an error
  }
};

module.exports = {
  ensureCompanyAccess,
  ensureUserBelongsToCompany,
  ensureManagerAccess,
  ensureAdminAccess,
  setCompanyContext
}; 