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

// Serve company-specific static files with proper routing
app.use('/uploads/companies/:company/avatars', (req, res, next) => {
  const companyName = req.params.company;
  const filePath = path.join(__dirname, '../uploads/companies', companyName, 'avatars');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

app.use('/uploads/companies/:company/reports', (req, res, next) => {
  const companyName = req.params.company;
  const filePath = path.join(__dirname, '../uploads/companies', companyName, 'reports');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

app.use('/uploads/companies/:company/files', (req, res, next) => {
  const companyName = req.params.company;
  const filePath = path.join(__dirname, '../uploads/companies', companyName, 'files');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

app.use('/uploads/companies/:company/calls', (req, res, next) => {
  const companyName = req.params.company;
  const filePath = path.join(__dirname, '../uploads/companies', companyName, 'calls');
  const staticMiddleware = express.static(filePath);
  staticMiddleware(req, res, next);
});

// Legacy static file serving (for backward compatibility)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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