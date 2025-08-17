const DatabaseService = require('../services/databaseService');
require('dotenv').config();

async function initializeDatabase() {
  try {
    console.log('Starting database initialization...');
    
    // Check current database status
    const status = await DatabaseService.checkDatabaseStatus();
    console.log('Current database status:', status);
    
    if (status.initialized) {
      console.log('Database is already initialized. All tables exist.');
      return;
    }

    
    await DatabaseService.initializeDatabase();
    console.log('Database initialization completed successfully!');
    
    // Verify initialization
    const verifyStatus = await DatabaseService.checkDatabaseStatus();
    if (verifyStatus.initialized) {
      console.log('Database verification successful. All tables created.');
    } else {
      console.error('Database verification failed. Missing table:', verifyStatus.missingTable);
    }
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database initialization script completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = initializeDatabase; 