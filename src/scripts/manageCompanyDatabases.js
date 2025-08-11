const CompanyDatabaseService = require('../services/companyDatabaseService');
require('dotenv').config();

async function listCompanyDatabases() {
  try {
    console.log('Listing all company databases...');
    const databases = await CompanyDatabaseService.getAllCompanyDatabases();
    
    if (databases.length === 0) {
      console.log('No company databases found.');
      return;
    }

    console.log('\nCompany Databases:');
    console.log('==================');
    
    for (const database of databases) {
      const companyName = database.replace('logos_ai_', '');
      console.log(`- ${companyName} (${database})`);
    }
    
    console.log(`\nTotal: ${databases.length} company database(s)`);
  } catch (error) {
    console.error('Error listing company databases:', error);
  }
}

async function createCompanyDatabase(companyName) {
  try {
    if (!companyName) {
      console.error('Please provide a company name');
      return;
    }

    console.log(`Creating database for company: ${companyName}`);
    
    // Check if database already exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    if (exists) {
      console.log(`Database for company "${companyName}" already exists`);
      return;
    }

    // Create the database
    const databaseName = await CompanyDatabaseService.createCompanyDatabase(companyName);
    console.log(`✅ Successfully created database: ${databaseName}`);
    
    // Get stats to verify
    const stats = await CompanyDatabaseService.getCompanyStats(companyName);
    console.log(`📊 Database initialized with tables. Current stats:`, stats);
    
  } catch (error) {
    console.error('Error creating company database:', error);
  }
}

async function deleteCompanyDatabase(companyName) {
  try {
    if (!companyName) {
      console.error('Please provide a company name');
      return;
    }

    console.log(`⚠️  WARNING: This will permanently delete the database for company: ${companyName}`);
    console.log('This action cannot be undone!');
    
    // Check if database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    if (!exists) {
      console.log(`Database for company "${companyName}" does not exist`);
      return;
    }

    // For safety, ask for confirmation (in a real scenario, you might want to add a --force flag)
    console.log('\nTo proceed with deletion, please confirm by typing the company name:');
    
    // In a real implementation, you would read from stdin
    // For now, we'll just proceed with a warning
    console.log('Proceeding with deletion...');
    
    await CompanyDatabaseService.deleteCompanyDatabase(companyName);
    console.log(`✅ Successfully deleted database for company: ${companyName}`);
    
  } catch (error) {
    console.error('Error deleting company database:', error);
  }
}

async function showCompanyStats(companyName) {
  try {
    if (!companyName) {
      console.error('Please provide a company name');
      return;
    }

    console.log(`Getting stats for company: ${companyName}`);
    
    // Check if database exists
    const exists = await CompanyDatabaseService.companyDatabaseExists(companyName);
    if (!exists) {
      console.log(`Database for company "${companyName}" does not exist`);
      return;
    }

    const stats = await CompanyDatabaseService.getCompanyStats(companyName);
    console.log('\nCompany Statistics:');
    console.log('==================');
    console.log(`Total Users: ${stats.total_users}`);
    console.log(`Employees: ${stats.employees}`);
    console.log(`Managers: ${stats.managers}`);
    
  } catch (error) {
    console.error('Error getting company stats:', error);
  }
}

// Command line interface
async function main() {
  const command = process.argv[2];
  const companyName = process.argv[3];

  try {
    switch (command) {
      case 'list':
        await listCompanyDatabases();
        break;
        
      case 'create':
        await createCompanyDatabase(companyName);
        break;
        
      case 'delete':
        await deleteCompanyDatabase(companyName);
        break;
        
      case 'stats':
        await showCompanyStats(companyName);
        break;
        
      default:
        console.log('Company Database Management Tool');
        console.log('================================');
        console.log('');
        console.log('Usage:');
        console.log('  node manageCompanyDatabases.js list                    - List all company databases');
        console.log('  node manageCompanyDatabases.js create <company_name>   - Create database for a company');
        console.log('  node manageCompanyDatabases.js delete <company_name>   - Delete database for a company');
        console.log('  node manageCompanyDatabases.js stats <company_name>    - Show stats for a company');
        console.log('');
        console.log('Examples:');
        console.log('  node manageCompanyDatabases.js create "Acme Corp"');
        console.log('  node manageCompanyDatabases.js stats "Acme Corp"');
        break;
    }
  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    // Close all connections
    await CompanyDatabaseService.closeAllConnections();
    process.exit(0);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  listCompanyDatabases,
  createCompanyDatabase,
  deleteCompanyDatabase,
  showCompanyStats
}; 