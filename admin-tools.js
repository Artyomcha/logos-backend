#!/usr/bin/env node

const readline = require('readline');
const DatabaseService = require('./src/services/databaseService');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function showMenu() {
  console.log('\n🏢 Logos AI - Company Management Tool');
  console.log('=====================================');
  console.log('1. List all companies');
  console.log('2. Create new company');
  console.log('3. Delete company');
  console.log('4. Check company status');
  console.log('5. Exit');
  console.log('=====================================');
}

async function listCompanies() {
  try {
    console.log('\n📋 Listing all companies...');
    const companies = await DatabaseService.getAllCompanies();
    
    if (companies.length === 0) {
      console.log('No companies found.');
      return;
    }
    
    console.log(`\nFound ${companies.length} company(ies):`);
    companies.forEach((company, index) => {
      const companyName = company.database_name.replace('logos_ai_', '');
      console.log(`${index + 1}. ${companyName} (${company.database_name})`);
      console.log(`   Size: ${company.size}`);
    });
  } catch (error) {
    console.error('❌ Error listing companies:', error.message);
  }
}

async function createCompany() {
  try {
    const companyName = await question('\nEnter company name: ');
    
    if (!companyName || companyName.trim() === '') {
      console.log('❌ Company name cannot be empty');
      return;
    }
    
    console.log(`\nCreating company: ${companyName}...`);
    const dbName = await DatabaseService.createCompanyDatabase(companyName);
    
    console.log('✅ Company created successfully!');
    console.log(`   Company: ${companyName}`);
    console.log(`   Database: ${dbName}`);
    console.log('\n📝 Next steps:');
    console.log(`   1. Manager can register at: POST /api/auth/register`);
    console.log(`   2. Use company name: ${companyName}`);
    console.log(`   3. Role: manager`);
    
  } catch (error) {
    console.error('❌ Error creating company:', error.message);
  }
}

async function deleteCompany() {
  try {
    const companies = await DatabaseService.getAllCompanies();
    
    if (companies.length === 0) {
      console.log('No companies to delete.');
      return;
    }
    
    console.log('\n📋 Select company to delete:');
    companies.forEach((company, index) => {
      const companyName = company.database_name.replace('logos_ai_', '');
      console.log(`${index + 1}. ${companyName}`);
    });
    
    const choice = await question('\nEnter company number (or "cancel"): ');
    
    if (choice.toLowerCase() === 'cancel') {
      return;
    }
    
    const index = parseInt(choice) - 1;
    if (isNaN(index) || index < 0 || index >= companies.length) {
      console.log('❌ Invalid selection');
      return;
    }
    
    const companyName = companies[index].database_name.replace('logos_ai_', '');
    const confirm = await question(`\n⚠️  Are you sure you want to delete "${companyName}"? (yes/no): `);
    
    if (confirm.toLowerCase() === 'yes') {
      console.log(`\nDeleting company: ${companyName}...`);
      await DatabaseService.deleteCompanyDatabase(companyName);
      console.log('✅ Company deleted successfully!');
    } else {
      console.log('❌ Deletion cancelled');
    }
    
  } catch (error) {
    console.error('❌ Error deleting company:', error.message);
  }
}

async function checkCompanyStatus() {
  try {
    const companyName = await question('\nEnter company name to check: ');
    
    if (!companyName || companyName.trim() === '') {
      console.log('❌ Company name cannot be empty');
      return;
    }
    
    console.log(`\nChecking status for: ${companyName}...`);
    const status = await DatabaseService.checkCompanyDatabaseStatus(companyName);
    
    if (status.initialized) {
      console.log('✅ Company database is properly initialized');
      
      // Get company stats
      try {
        const stats = await DatabaseService.getCompanyStats(companyName);
        console.log(`📊 Company statistics:`);
        console.log(`   Total users: ${stats.total_users || 0}`);
        console.log(`   Employees: ${stats.employees || 0}`);
        console.log(`   Managers: ${stats.managers || 0}`);
      } catch (error) {
        console.log('📊 No users found yet');
      }
    } else {
      console.log('❌ Company database is not properly initialized');
      if (status.missingTable) {
        console.log(`   Missing table: ${status.missingTable}`);
      }
      if (status.error) {
        console.log(`   Error: ${status.error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking company status:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting Logos AI Company Management Tool...');
  
  try {
    // Test database connection
    console.log('Testing database connection...');
    await DatabaseService.getAllCompanies();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n🔧 Please check your environment variables:');
    console.log('   - DB_HOST');
    console.log('   - DB_PORT');
    console.log('   - DB_USER');
    console.log('   - DB_PASSWORD');
    console.log('   - DB_NAME');
    process.exit(1);
  }
  
  while (true) {
    await showMenu();
    const choice = await question('\nSelect option (1-5): ');
    
    switch (choice) {
      case '1':
        await listCompanies();
        break;
      case '2':
        await createCompany();
        break;
      case '3':
        await deleteCompany();
        break;
      case '4':
        await checkCompanyStatus();
        break;
      case '5':
        console.log('\n👋 Goodbye!');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('❌ Invalid option. Please select 1-5.');
    }
    
    await question('\nPress Enter to continue...');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down gracefully...');
  await DatabaseService.closeAllConnections();
  rl.close();
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 