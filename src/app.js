const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const reportsRoutes = require('./routes/reports');
const companyRoutes = require('./routes/company');
const companyDatabaseRoutes = require('./routes/companyDatabase');
const companyDataRoutes = require('./routes/companyData');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const analyticsRoutes = require('./routes/analytics');
const employeeStatsRoutes = require('./routes/employeeStats');
const employeeRoutes = require('./routes/employee');
const apiKeysRoutes = require('./routes/apiKeys');
const DatabaseService = require('./services/databaseService');

const app = express();
app.use(cors());
app.use(express.json());

// Cloudinary handles file serving - no need for static file serving

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/company-database', companyDatabaseRoutes);
app.use('/api/company-data', companyDataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/employee-stats', employeeStatsRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/keys', apiKeysRoutes);

// Get all companies
app.get('/api/companies', async (req, res) => {
  try {
    const companies = await DatabaseService.getAllCompanies();
    res.json(companies);
  } catch (error) {
    console.error('Error getting companies:', error);
    res.status(500).json({ message: 'Ошибка при получении списка компаний' });
  }
});

// Create a new company database
app.post('/api/companies', async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName) {
      return res.status(400).json({ message: 'Название компании обязательно' });
    }
    
    const dbName = await DatabaseService.createCompanyDatabase(companyName);
    res.json({ message: 'Компания создана', databaseName: dbName });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ message: 'Ошибка при создании компании' });
  }
});

app.get('/', (req, res) => {
  res.send('Logos AI backend is running');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await DatabaseService.closeAllConnections();
  process.exit(0);
});