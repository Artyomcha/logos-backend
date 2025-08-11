const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class SchemaBasedService {
  static pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  /**
   * Sanitize company name for schema name
   */
  static sanitizeCompanyName(companyName) {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Get schema name for company
   */
  static getCompanySchemaName(companyName) {
    return `company_${this.sanitizeCompanyName(companyName)}`;
  }

  /**
   * Create a new company schema
   */
  static async createCompanySchema(companyName) {
    try {
      const schemaName = this.getCompanySchemaName(companyName);
      
      // Create schema
      await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      
      // Initialize schema with tables
      await this.initializeCompanySchema(companyName);
      
      console.log(`Schema created: ${schemaName}`);
      return schemaName;
    } catch (error) {
      console.error('Error creating company schema:', error);
      throw error;
    }
  }

  /**
   * Initialize a company schema with all necessary tables
   */
  static async initializeCompanySchema(companyName) {
    try {
      const schemaName = this.getCompanySchemaName(companyName);
      const initSQL = fs.readFileSync(
        path.join(__dirname, '../models/init.sql'),
        'utf8'
      );
      
      // Replace table names with schema-qualified names
      const schemaSQL = initSQL
        .replace(/CREATE TABLE IF NOT EXISTS /g, `CREATE TABLE IF NOT EXISTS "${schemaName}".`)
        .replace(/CREATE INDEX IF NOT EXISTS /g, `CREATE INDEX IF NOT EXISTS "${schemaName}".`)
        .replace(/DROP TABLE IF EXISTS /g, `DROP TABLE IF EXISTS "${schemaName}".`);
      
      await this.pool.query(schemaSQL);
      console.log(`Schema initialized for company: ${companyName}`);
      return true;
    } catch (error) {
      console.error('Error initializing company schema:', error);
      throw error;
    }
  }

  /**
   * Check if company schema exists
   */
  static async companySchemaExists(companyName) {
    try {
      const schemaName = this.getCompanySchemaName(companyName);
      const result = await this.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.schemata 
          WHERE schema_name = $1
        )
      `, [schemaName]);
      
      return result.rows[0].exists;
    } catch (error) {
      console.error('Error checking company schema:', error);
      return false;
    }
  }

  /**
   * Get all company schemas
   */
  static async getAllCompanySchemas() {
    try {
      const result = await this.pool.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name LIKE 'company_%'
        ORDER BY schema_name
      `);
      
      return result.rows.map(row => row.schema_name);
    } catch (error) {
      console.error('Error getting company schemas:', error);
      throw error;
    }
  }

  /**
   * Execute query in company schema
   */
  static async executeCompanyQuery(companyName, query, params = []) {
    try {
      const schemaName = this.getCompanySchemaName(companyName);
      
      // Set search path to company schema
      await this.pool.query(`SET search_path TO "${schemaName}", public`);
      
      // Execute the query
      const result = await this.pool.query(query, params);
      
      // Reset search path
      await this.pool.query('SET search_path TO public');
      
      return result;
    } catch (error) {
      console.error('Error executing company query:', error);
      throw error;
    }
  }

  /**
   * Get company statistics
   */
  static async getCompanyStats(companyName) {
    try {
      const schemaName = this.getCompanySchemaName(companyName);
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN role = 'employee' THEN 1 END) as employees,
          COUNT(CASE WHEN role = 'manager' THEN 1 END) as managers
        FROM "${schemaName}".user_auth 
        WHERE company_name = $1
      `, [companyName]);

      return result.rows[0];
    } catch (error) {
      console.error('Error getting company stats:', error);
      throw error;
    }
  }

  /**
   * Delete company schema
   */
  static async deleteCompanySchema(companyName) {
    try {
      const schemaName = this.getCompanySchemaName(companyName);
      
      // Drop schema and all its contents
      await this.pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      
      console.log(`Schema deleted: ${schemaName}`);
      return true;
    } catch (error) {
      console.error('Error deleting company schema:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  static async closeConnection() {
    await this.pool.end();
  }
}

module.exports = SchemaBasedService; 