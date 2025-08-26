#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Конфигурация backup
const BACKUP_CONFIG = {
  // Директории для backup
  backupDir: '/app/backups',
  dbBackupDir: '/app/backups/database',
  filesBackupDir: '/app/backups/files',
  logsBackupDir: '/app/backups/logs',
  
  // Настройки хранения
  retentionDays: {
    daily: 7,      // Ежедневные backup храним 7 дней
    weekly: 4,     // Еженедельные backup храним 4 недели
    monthly: 12    // Ежемесячные backup храним 12 месяцев
  },
  
  // Максимальный размер backup файла (100MB)
  maxBackupSize: 100 * 1024 * 1024
};

// Создание директорий для backup
function createBackupDirectories() {
  const dirs = [
    BACKUP_CONFIG.backupDir,
    BACKUP_CONFIG.dbBackupDir,
    BACKUP_CONFIG.filesBackupDir,
    BACKUP_CONFIG.logsBackupDir
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

// Backup базы данных
async function backupDatabase() {
  try {
    console.log('Starting database backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-backup-${timestamp}.sql`;
    const filepath = path.join(BACKUP_CONFIG.dbBackupDir, filename);
    
    // Получаем DATABASE_URL из переменных окружения
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found in environment variables');
    }
    
    // Создаем backup с помощью pg_dump
    const command = `pg_dump "${databaseUrl}" > "${filepath}"`;
    await execAsync(command);
    
    // Проверяем размер файла
    const stats = fs.statSync(filepath);
    console.log(`Database backup created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Сжимаем backup
    const compressedFile = `${filepath}.gz`;
    await execAsync(`gzip "${filepath}"`);
    
    const compressedStats = fs.statSync(compressedFile);
    console.log(`Database backup compressed: ${filename}.gz (${(compressedStats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    return compressedFile;
  } catch (error) {
    console.error('Database backup failed:', error.message);
    throw error;
  }
}

// Backup файлов (uploads)
async function backupFiles() {
  try {
    console.log('Starting files backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `files-backup-${timestamp}.tar.gz`;
    const filepath = path.join(BACKUP_CONFIG.filesBackupDir, filename);
    
    // Создаем tar.gz архив всех uploads
    const command = `tar -czf "${filepath}" -C /app uploads/`;
    await execAsync(command);
    
    const stats = fs.statSync(filepath);
    console.log(`Files backup created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    return filepath;
  } catch (error) {
    console.error('Files backup failed:', error.message);
    throw error;
  }
}

// Backup логов
async function backupLogs() {
  try {
    console.log('Starting logs backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-backup-${timestamp}.tar.gz`;
    const filepath = path.join(BACKUP_CONFIG.logsBackupDir, filename);
    
    // Создаем tar.gz архив всех логов
    const logsPath = process.env.NODE_ENV === 'production' ? '/app/logs' : './logs';
    const command = `tar -czf "${filepath}" -C ${logsPath} . 2>/dev/null || echo "No logs directory found"`;
    await execAsync(command);
    
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      console.log(`Logs backup created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      return filepath;
    } else {
      console.log('No logs directory found, skipping logs backup');
      return null;
    }
  } catch (error) {
    console.error('Logs backup failed:', error.message);
    return null;
  }
}

// Очистка старых backup файлов
function cleanupOldBackups() {
  console.log('Cleaning up old backups...');
  
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  // Функция для удаления старых файлов
  function cleanupDirectory(dir, retentionDays) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    const cutoffDate = now - (retentionDays * oneDay);
    
    files.forEach(file => {
      const filepath = path.join(dir, file);
      const stats = fs.statSync(filepath);
      
      if (stats.mtime.getTime() < cutoffDate) {
        fs.unlinkSync(filepath);
        console.log(`Deleted old backup: ${file}`);
      }
    });
  }
  
  // Очищаем по типам backup
  cleanupDirectory(BACKUP_CONFIG.dbBackupDir, BACKUP_CONFIG.retentionDays.daily);
  cleanupDirectory(BACKUP_CONFIG.filesBackupDir, BACKUP_CONFIG.retentionDays.weekly);
  cleanupDirectory(BACKUP_CONFIG.logsBackupDir, BACKUP_CONFIG.retentionDays.monthly);
}

// Проверка размера backup
function checkBackupSize(backupFiles) {
  let totalSize = 0;
  
  backupFiles.forEach(file => {
    if (file && fs.existsSync(file)) {
      const stats = fs.statSync(file);
      totalSize += stats.size;
    }
  });
  
  if (totalSize > BACKUP_CONFIG.maxBackupSize) {
    console.warn(`Warning: Total backup size (${(totalSize / 1024 / 1024).toFixed(2)} MB) exceeds limit (${(BACKUP_CONFIG.maxBackupSize / 1024 / 1024).toFixed(2)} MB)`);
  }
  
  return totalSize;
}

// Создание отчета о backup
function createBackupReport(backupFiles, totalSize, duration) {
  const report = {
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
    files: backupFiles.filter(Boolean).map(file => ({
      name: path.basename(file),
      size: fs.existsSync(file) ? `${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB` : '0 MB'
    })),
    status: 'completed'
  };
  
  const reportFile = path.join(BACKUP_CONFIG.backupDir, `backup-report-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  console.log('Backup report created:', reportFile);
  return report;
}

// Основная функция backup
async function runBackup() {
  const startTime = Date.now();
  
  try {
    console.log('=== Starting backup process ===');
    
    // Создаем директории
    createBackupDirectories();
    
    // Выполняем backup
    const dbBackup = await backupDatabase();
    const filesBackup = await backupFiles();
    const logsBackup = await backupLogs();
    
    const backupFiles = [dbBackup, filesBackup, logsBackup];
    
    // Проверяем размер
    const totalSize = checkBackupSize(backupFiles);
    
    // Очищаем старые backup
    cleanupOldBackups();
    
    // Создаем отчет
    const duration = Date.now() - startTime;
    const report = createBackupReport(backupFiles, totalSize, duration);
    
    console.log('=== Backup completed successfully ===');
    console.log('Duration:', report.duration);
    console.log('Total size:', report.totalSize);
    
    return report;
    
  } catch (error) {
    console.error('=== Backup failed ===');
    console.error('Error:', error.message);
    throw error;
  }
}

// Функция для восстановления из backup
async function restoreFromBackup(backupFile, type = 'database') {
  try {
    console.log(`Starting restore from ${backupFile}...`);
    
    if (type === 'database') {
      // Восстановление базы данных
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not found');
      }
      
      // Распаковываем если нужно
      let sqlFile = backupFile;
      if (backupFile.endsWith('.gz')) {
        await execAsync(`gunzip -c "${backupFile}" > "${backupFile.replace('.gz', '')}"`);
        sqlFile = backupFile.replace('.gz', '');
      }
      
      // Восстанавливаем
      const command = `psql "${databaseUrl}" < "${sqlFile}"`;
      await execAsync(command);
      
      console.log('Database restored successfully');
      
    } else if (type === 'files') {
      // Восстановление файлов
      const command = `tar -xzf "${backupFile}" -C /app`;
      await execAsync(command);
      
      console.log('Files restored successfully');
    }
    
  } catch (error) {
    console.error('Restore failed:', error.message);
    throw error;
  }
}

// Запуск если скрипт вызван напрямую
if (require.main === module) {
  runBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  runBackup,
  restoreFromBackup,
  backupDatabase,
  backupFiles,
  backupLogs
};
