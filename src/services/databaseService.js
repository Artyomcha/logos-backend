const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DatabaseService {
  // Store company-specific database connections
  static companyConnections = new Map();

  /**
   * Get or create a database connection for a specific company
   */
  static async getCompanyConnection(companyName) {
    if (this.companyConnections.has(companyName)) {
      return this.companyConnections.get(companyName);
    }

    // Create new connection for company
    const connection = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: this.getCompanyDatabaseName(companyName),
    });

    this.companyConnections.set(companyName, connection);
    return connection;
  }

  /**
   * Generate database name for company
   */
  static getCompanyDatabaseName(companyName) {
    // Sanitize company name for database name
    const sanitizedName = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    return `logos_ai_${sanitizedName}`;
  }

  /**
   * Create a new database for a company
   */
  static async createCompanyDatabase(companyName) {
    try {
      // Connect to default database to create new database
      const defaultPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME, // Connect to default database
      });

      const dbName = this.getCompanyDatabaseName(companyName);
      
      // Check if database already exists
      const checkResult = await defaultPool.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [dbName]
      );

      if (checkResult.rows.length === 0) {
        // Create new database
        await defaultPool.query(`CREATE DATABASE "${dbName}"`);
        console.log(`Database created: ${dbName}`);
      }

      await defaultPool.end();

      // Initialize the new database with tables
      await this.initializeCompanyDatabase(companyName);

      return dbName;
    } catch (error) {
      console.error('Error creating company database:', error);
      throw error;
    }
  }

  /**
   * Initialize a company database with all necessary tables
   */
  static async initializeCompanyDatabase(companyName) {
    try {
      const connection = await this.getCompanyConnection(companyName);
      const initSQL = fs.readFileSync(
        path.join(__dirname, '../models/init.sql'),
        'utf8'
      );
      
      await connection.query(initSQL);
      console.log(`Database initialized for company: ${companyName}`);
      return true;
    } catch (error) {
      console.error('Error initializing company database:', error);
      throw error;
    }
  }

  /**
   * Check if company database exists and is properly initialized
   */
  static async checkCompanyDatabaseStatus(companyName) {
    try {
      const connection = await this.getCompanyConnection(companyName);
      
      const tables = [
        'user_auth',
        'employee_stats',
        'overall_data',
        'dialogues',
        'verification',
        'departament_report',
        'uploaded_files'
      ];

      for (const table of tables) {
        const result = await connection.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        
        if (!result.rows[0].exists) {
          return { initialized: false, missingTable: table };
        }
      }
      
      return { initialized: true };
    } catch (error) {
      console.error('Error checking company database status:', error);
      return { initialized: false, error: error.message };
    }
  }

  /**
   * Setup initial data for a new company
   */
  static async setupCompanyData(companyName, managerId) {
    try {
      // Create company-specific directories
      const uploadDirs = [
        `uploads/companies/${companyName}/avatars`,
        `uploads/companies/${companyName}/reports`,
        `uploads/companies/${companyName}/files`
      ];

      for (const dir of uploadDirs) {
        const fullPath = path.join(__dirname, '../../', dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      }

      console.log(`Company setup completed for: ${companyName}`);
      return true;
    } catch (error) {
      console.error('Error setting up company data:', error);
      throw error;
    }
  }

  /**
   * Get company statistics
   */
  static async getCompanyStats(companyName) {
    try {
      const connection = await this.getCompanyConnection(companyName);
      
      const stats = await connection.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN role = 'employee' THEN 1 END) as employees,
          COUNT(CASE WHEN role = 'manager' THEN 1 END) as managers
        FROM user_auth 
        WHERE company_name = $1
      `, [companyName]);

      return stats.rows[0];
    } catch (error) {
      console.error('Error getting company stats:', error);
      throw error;
    }
  }

  /**
   * Get all companies (from default database)
   */
  static async getAllCompanies() {
    try {
      const defaultPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });

      const companies = await defaultPool.query(`
        SELECT 
          pg_database.datname as database_name,
          pg_size_pretty(pg_database_size(pg_database.datname)) as size
        FROM pg_database 
        WHERE pg_database.datname LIKE 'logos_ai_%'
        ORDER BY pg_database_size(pg_database.datname) DESC
      `);

      await defaultPool.end();
      return companies.rows;
    } catch (error) {
      console.error('Error getting companies:', error);
      throw error;
    }
  }

  /**
   * Delete a company database
   */
  static async deleteCompanyDatabase(companyName) {
    try {
      const dbName = this.getCompanyDatabaseName(companyName);
      
      // Close connection if exists
      if (this.companyConnections.has(companyName)) {
        const connection = this.companyConnections.get(companyName);
        await connection.end();
        this.companyConnections.delete(companyName);
      }

      // Connect to default database to drop company database
      const defaultPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });

      // Terminate all connections to the database before dropping
      await defaultPool.query(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [dbName]);

      await defaultPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await defaultPool.end();

      console.log(`Database deleted: ${dbName}`);
      return true;
    } catch (error) {
      console.error('Error deleting company database:', error);
      throw error;
    }
  }

  /**
   * Close all company connections
   */
  static async closeAllConnections() {
    for (const [companyName, connection] of this.companyConnections) {
      await connection.end();
    }
    this.companyConnections.clear();
  }

  /**
   * Get user companies by email
   */
  static async getUserCompanies(email) {
    try {
      const defaultPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });

      // Get all company databases (exclude main database)
      const companiesResult = await defaultPool.query(`
        SELECT datname as database_name
        FROM pg_database
        WHERE datname LIKE 'logos_ai_%' 
        AND datname != $1
      `, [process.env.DB_NAME]);

      const userCompanies = [];

      // Check each company database for the user
      for (const row of companiesResult.rows) {
        const companyName = row.database_name.replace('logos_ai_', '');
        
        try {
          const companyPool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: row.database_name,
          });

          // Check if user_auth table exists in this database
          const tableExistsResult = await companyPool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = 'user_auth'
            )
          `);

          if (!tableExistsResult.rows[0].exists) {
            console.log(`Table user_auth does not exist in database ${row.database_name}, skipping...`);
            await companyPool.end();
            continue;
          }

          const userResult = await companyPool.query(
            'SELECT id, email, role, first_name, last_name, company_name FROM user_auth WHERE email = $1',
            [email]
          );

          await companyPool.end();

          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            userCompanies.push({
              companyName: companyName,
              role: user.role,
              firstName: user.first_name,
              lastName: user.last_name
            });
          }
        } catch (error) {
          console.error(`Error checking company ${companyName}:`, error);
          // Continue checking other companies
        }
      }

      await defaultPool.end();
      return userCompanies;
    } catch (error) {
      console.error('Error getting user companies:', error);
      // Return empty array instead of throwing error
      return [];
    }
  }

  /**
   * Initialize the main database with necessary tables
   */
  static async initializeDatabase() {
    try {
      const defaultPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });

      // Read and execute init.sql
      const initSQL = fs.readFileSync(
        path.join(__dirname, '../models/init.sql'),
        'utf8'
      );
      
      await defaultPool.query(initSQL);
      await defaultPool.end();
      
      console.log('Main database initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing main database:', error);
      throw error;
    }
  }

  /**
   * Check if main database is properly initialized
   */
  static async checkDatabaseStatus() {
    try {
      const defaultPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });

      const tables = [
        'user_auth',
        'employees',
        'employee_stats',
        'overall_data',
        'dialogues',
        'departament_report',
        'uploaded_files',
        'department_analytics',
        'call_quality'
      ];

      for (const table of tables) {
        const result = await defaultPool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        
        if (!result.rows[0].exists) {
          await defaultPool.end();
          return { initialized: false, missingTable: table };
        }
      }

      await defaultPool.end();
      return { initialized: true };
    } catch (error) {
      console.error('Error checking database status:', error);
      return { initialized: false, error: error.message };
    }
  }
}

module.exports = DatabaseService; 