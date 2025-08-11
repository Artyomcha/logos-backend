const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class CompanyDatabaseService {
  // Master connection pool for creating databases
  static masterPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres', // Connect to default postgres database
  });

  // Cache for company-specific connection pools
  static companyPools = new Map();

  /**
   * Create a new database for a company
   */
  static async createCompanyDatabase(companyName) {
    try {
      const sanitizedCompanyName = this.sanitizeCompanyName(companyName);
      const databaseName = `logos_ai_${sanitizedCompanyName}`;

      // Check if database already exists
      const existsResult = await this.masterPool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [databaseName]
      );

      if (existsResult.rows.length > 0) {
        console.log(`Database ${databaseName} already exists`);
        return databaseName;
      }

      // Create the database
      await this.masterPool.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`Created database: ${databaseName}`);

      // Initialize tables in the new database
      await this.initializeCompanyDatabase(databaseName);

      return databaseName;
    } catch (error) {
      console.error('Error creating company database:', error);
      throw error;
    }
  }

  /**
   * Initialize all tables in a company's database
   */
  static async initializeCompanyDatabase(databaseName) {
    try {
      // Create a temporary connection to the new database
      const tempPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: databaseName,
      });

      // Read and execute the initialization SQL
      const initSQL = fs.readFileSync(
        path.join(__dirname, '../models/init.sql'),
        'utf8'
      );

      await tempPool.query(initSQL);
      console.log(`Initialized tables in database: ${databaseName}`);

      // Close the temporary connection
      await tempPool.end();
    } catch (error) {
      console.error('Error initializing company database:', error);
      throw error;
    }
  }

  /**
   * Get or create a connection pool for a specific company
   */
  static getCompanyPool(companyName) {
    const sanitizedCompanyName = this.sanitizeCompanyName(companyName);
    const databaseName = `logos_ai_${sanitizedCompanyName}`;

    // Check if pool already exists in cache
    if (this.companyPools.has(databaseName)) {
      return this.companyPools.get(databaseName);
    }

    // Create new pool for this company
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: databaseName,
    });

    // Cache the pool
    this.companyPools.set(databaseName, pool);
    console.log(`Created connection pool for database: ${databaseName}`);

    return pool;
  }

  /**
   * Execute a query on a specific company's database
   */
  static async executeCompanyQuery(companyName, query, params = []) {
    try {
      // Check if company database exists, create if it doesn't
      const exists = await this.companyDatabaseExists(companyName);
      if (!exists) {
        console.log(`Company database for ${companyName} does not exist, creating...`);
        await this.createCompanyDatabase(companyName);
      }
  
      const pool = this.getCompanyPool(companyName);
      const result = await pool.query(query, params);
      return result;
    } catch (error) {
      console.error('Error executing company query:', error);
      throw error;
    }
  }

  /**
   * Check if a company's database exists
   */
  static async companyDatabaseExists(companyName) {
    try {
      const sanitizedCompanyName = this.sanitizeCompanyName(companyName);
      const databaseName = `logos_ai_${sanitizedCompanyName}`;

      const result = await this.masterPool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [databaseName]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking if company database exists:', error);
      throw error;
    }
  }

  /**
   * Get all company databases
   */
  static async getAllCompanyDatabases() {
    try {
      const result = await this.masterPool.query(
        `SELECT datname FROM pg_database WHERE datname LIKE 'logos_ai_%' ORDER BY datname`
      );

      return result.rows.map(row => row.datname);
    } catch (error) {
      console.error('Error getting company databases:', error);
      throw error;
    }
  }

  /**
   * Delete a company's database (use with caution!)
   */
  static async deleteCompanyDatabase(companyName) {
    try {
      const sanitizedCompanyName = this.sanitizeCompanyName(companyName);
      const databaseName = `logos_ai_${sanitizedCompanyName}`;

      // Close any existing connections to this database
      if (this.companyPools.has(databaseName)) {
        const pool = this.companyPools.get(databaseName);
        await pool.end();
        this.companyPools.delete(databaseName);
      }

      // Drop the database
      await this.masterPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      console.log(`Deleted database: ${databaseName}`);

      return true;
    } catch (error) {
      console.error('Error deleting company database:', error);
      throw error;
    }
  }

  /**
   * Sanitize company name for database naming
   */
  static sanitizeCompanyName(companyName) {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Close all company database connections
   */
  static async closeAllConnections() {
    try {
      // Close all company pools
      for (const [databaseName, pool] of this.companyPools) {
        await pool.end();
        console.log(`Closed connection pool for: ${databaseName}`);
      }
      this.companyPools.clear();

      // Close master pool
      await this.masterPool.end();
      console.log('Closed master database connection');
    } catch (error) {
      console.error('Error closing connections:', error);
      throw error;
    }
  }

  /**
   * Get company statistics from their specific database
   */
  static async getCompanyStats(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN role = 'employee' THEN 1 END) as employees,
          COUNT(CASE WHEN role = 'manager' THEN 1 END) as managers
        FROM user_auth
      `);

      return result.rows[0];
    } catch (error) {
      console.error('Error getting company stats:', error);
      throw error;
    }
  }

  /**
   * Get all users for a specific company (managers and employees)
   */
  static async getCompanyUsers(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          ua.id,
          ua.email,
          ua.role,
          ua.first_name,
          ua.last_name,
          ua.created_at,
          ua.avatar_url,
          e.id as employee_id,
          e.registed_at as employee_registered_at
        FROM user_auth ua
        LEFT JOIN employees e ON ua.id = e.user_id
        ORDER BY ua.role DESC, ua.created_at ASC
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company users:', error);
      throw error;
    }
  }

  /**
   * Get managers for a specific company
   */
  static async getCompanyManagers(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          ua.id,
          ua.email,
          ua.first_name,
          ua.last_name,
          ua.created_at,
          ua.avatar_url
        FROM user_auth ua
        WHERE ua.role = 'manager'
        ORDER BY ua.created_at ASC
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company managers:', error);
      throw error;
    }
  }

  /**
   * Get employees for a specific company
   */
  static async getCompanyEmployees(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          ua.id,
          ua.email,
          ua.first_name,
          ua.last_name,
          ua.created_at,
          ua.avatar_url,
          e.id as employee_id,
          e.registed_at as employee_registered_at,
          ROUND(COALESCE(AVG(es.rating), 0), 1) as rating,
          COALESCE(SUM(es.calls), 0) as calls,
          COALESCE(SUM(es.deals), 0) as deals,
          COALESCE(SUM(es.plan), 0) as plan,
          COALESCE(SUM(es.error), 0) as error
        FROM user_auth ua
        JOIN employees e ON ua.id = e.user_id
        LEFT JOIN employee_stats es ON e.id = es.user_id
        WHERE ua.role = 'employee'
        GROUP BY ua.id, ua.email, ua.first_name, ua.last_name, ua.created_at, ua.avatar_url, e.id, e.registed_at
        ORDER BY ua.created_at ASC
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company employees:', error);
      throw error;
    }
  }

  /**
   * Get employee performance data for a specific company
   */
  static async getCompanyEmployeeStats(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          ua.id,
          ua.first_name,
          ua.last_name,
          ua.email,
          ROUND(COALESCE(AVG(es.rating), 0), 1) as rating,
          COALESCE(SUM(es.calls), 0) as calls,
          COALESCE(SUM(es.deals), 0) as deals,
          COALESCE(SUM(es.plan), 0) as plan,
          COALESCE(SUM(es.error), 0) as error,
          MAX(es.created_at) as updated_at
        FROM user_auth ua
        JOIN employees e ON ua.id = e.user_id
        LEFT JOIN employee_stats es ON e.id = es.user_id
        WHERE ua.role = 'employee'
        GROUP BY ua.id, ua.first_name, ua.last_name, ua.email
        ORDER BY rating DESC NULLS LAST
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company employee stats:', error);
      throw error;
    }
  }

  /**
   * Get tasks and reports for a specific company
   */
  static async getCompanyTasks(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          od.id,
          od.task_name,
          od.grade,
          od.report,
          od.submitted_at,
          ua.first_name,
          ua.last_name,
          ua.email
        FROM overall_data od
        JOIN employees e ON od.user_id = e.id
        JOIN user_auth ua ON e.user_id = ua.id
        ORDER BY od.submitted_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company tasks:', error);
      throw error;
    }
  }

  /**
   * Get dialogues for a specific company
   */
  static async getCompanyDialogues(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          d.id,
          d.task_name,
          d.full_dialogue,
          d.recorded_at,
          ua.first_name,
          ua.last_name,
          ua.email
        FROM dialogues d
        JOIN employees e ON d.user_id = e.id
        JOIN user_auth ua ON e.user_id = ua.id
        ORDER BY d.recorded_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company dialogues:', error);
      throw error;
    }
  }

  /**
   * Get department reports for a specific company
   */
  static async getCompanyReports(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          dr.id,
          dr.title,
          dr.file_url,
          dr.created_at,
          ua.first_name,
          ua.last_name,
          ua.email
        FROM departament_report dr
        JOIN user_auth ua ON dr.created_by = ua.id
        ORDER BY dr.created_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company reports:', error);
      throw error;
    }
  }

  /**
   * Get uploaded files for a specific company
   */
  static async getCompanyFiles(companyName) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          uf.id,
          uf.original_name,
          uf.file_url,
          uf.upload_date,
          ua.first_name,
          ua.last_name,
          ua.email
        FROM uploaded_files uf
        JOIN user_auth ua ON uf.uploaded_by = ua.id
        ORDER BY uf.upload_date DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company files:', error);
      throw error;
    }
  }

  /**
   * Check if user belongs to a specific company
   */
  static async userBelongsToCompany(companyName, userId) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT COUNT(*) as count
        FROM user_auth
        WHERE id = $1
      `, [userId]);

      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('Error checking user company membership:', error);
      throw error;
    }
  }

  /**
   * Get company activity summary
   */
  static async getCompanyActivity(companyName, period = 30) {
    try {
      const result = await this.executeCompanyQuery(companyName, `
        SELECT 
          'user_registration' as type,
          ua.created_at as date,
          ua.first_name || ' ' || ua.last_name as description,
          ua.role as user_role
        FROM user_auth ua
        WHERE ua.created_at >= NOW() - INTERVAL '${period} days'
        
        UNION ALL
        
        SELECT 
          'employee_registration' as type,
          e.registed_at as date,
          e.first_name || ' ' || e.last_name as description,
          'employee' as user_role
        FROM employees e
        JOIN user_auth ua ON e.user_id = ua.id
        WHERE e.registed_at >= NOW() - INTERVAL '${period} days'
        
        UNION ALL
        
        SELECT 
          'task_submission' as type,
          od.submitted_at as date,
          od.task_name as description,
          'task' as user_role
        FROM overall_data od
        JOIN employees e ON od.user_id = e.id
        JOIN user_auth ua ON e.user_id = ua.id
        WHERE od.submitted_at >= NOW() - INTERVAL '${period} days'
        
        UNION ALL
        
        SELECT 
          'dialogue_recorded' as type,
          d.recorded_at as date,
          d.task_name as description,
          'dialogue' as user_role
        FROM dialogues d
        JOIN employees e ON d.user_id = e.id
        JOIN user_auth ua ON e.user_id = ua.id
        WHERE d.recorded_at >= NOW() - INTERVAL '${period} days'
        
        ORDER BY date DESC
        LIMIT 50
      `);

      return result.rows;
    } catch (error) {
      console.error('Error getting company activity:', error);
      throw error;
    }
  }
}

module.exports = CompanyDatabaseService; 