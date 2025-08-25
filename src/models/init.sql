-- Drop existing tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS uploaded_files CASCADE;
DROP TABLE IF EXISTS departament_report CASCADE;
DROP TABLE IF EXISTS employee_weekly_stats CASCADE;
DROP TABLE IF EXISTS employee_monthly_stats CASCADE;
DROP TABLE IF EXISTS employee_stats CASCADE;
DROP TABLE IF EXISTS dialogues CASCADE;
DROP TABLE IF EXISTS overall_data CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS user_auth CASCADE;

-- Create user_auth table
CREATE TABLE IF NOT EXISTS user_auth (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    avatar_url VARCHAR(255),
    company_name VARCHAR(255)
);

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    registed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_auth(id) ON DELETE CASCADE
);

-- Create employee_stats table (multiple records per employee like department_analytics)
CREATE TABLE IF NOT EXISTS employee_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    rating NUMERIC DEFAULT 0,
    calls INTEGER DEFAULT 0,
    deals INTEGER DEFAULT 0,
    plan INTEGER DEFAULT 0,
    error INTEGER DEFAULT 0,
    avg_call_duration_minutes NUMERIC DEFAULT 0,
    script_compliance_percentage INTEGER DEFAULT 0,
    key_phrases_used INTEGER DEFAULT 0,
    forbidden_phrases_count INTEGER DEFAULT 0,
    stages_completed INTEGER DEFAULT 0,
    total_stages INTEGER DEFAULT 0,
    success_rate_percentage NUMERIC DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE
);



-- Create overall_data table
CREATE TABLE IF NOT EXISTS overall_data (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    task_name VARCHAR(255) UNIQUE,
    grade INTEGER,
    report TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Create dialogues table
CREATE TABLE IF NOT EXISTS dialogues (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    task_name VARCHAR(255),
    full_dialogue TEXT,
    audio_file_url VARCHAR(500),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (task_name) REFERENCES overall_data(task_name) ON DELETE SET NULL
);

-- Create departament_report table
CREATE TABLE IF NOT EXISTS departament_report (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    file_url VARCHAR(255),
    report_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES user_auth(id) ON DELETE CASCADE
);

-- Create uploaded_files table
CREATE TABLE IF NOT EXISTS uploaded_files (
    id SERIAL PRIMARY KEY,
    original_name VARCHAR(255),
    file_url VARCHAR(255),
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by INTEGER NOT NULL,
    FOREIGN KEY (uploaded_by) REFERENCES user_auth(id) ON DELETE CASCADE
);

-- Create department_analytics table for dashboard charts
CREATE TABLE IF NOT EXISTS department_analytics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL,
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    call_duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_auth(id) ON DELETE CASCADE
);

-- Create call_quality table for quality dashboard
CREATE TABLE IF NOT EXISTS call_quality (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL,
    call_id VARCHAR(100) UNIQUE NOT NULL,
    script_compliance_percentage INTEGER DEFAULT 0,
    stages_completed INTEGER DEFAULT 0,
    total_stages INTEGER DEFAULT 0,
    key_phrases_used INTEGER DEFAULT 0,
    forbidden_phrases_count INTEGER DEFAULT 0,
    forbidden_phrases_list TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_auth(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS call_training (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    length INTEGER DEFAULT 0,
    recommendations TEXT,
    quote TEXT,
    trail1_url VARCHAR(500),
    trail1_grade INTEGER DEFAULT 0,
    trail2_url VARCHAR(500),
    trail2_grade INTEGER DEFAULT 0,
    trail3_url VARCHAR(500),
    trail3_grade INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_auth_email ON user_auth(email);
CREATE INDEX IF NOT EXISTS idx_user_auth_company ON user_auth(company_name);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_stats_user_id ON employee_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_overall_data_user_id ON overall_data(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogues_user_id ON dialogues(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogues_task_name ON dialogues(task_name);
CREATE INDEX IF NOT EXISTS idx_departament_report_created_by ON departament_report(created_by);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_uploaded_by ON uploaded_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_department_analytics_user_id ON department_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_department_analytics_date ON department_analytics(date);
CREATE INDEX IF NOT EXISTS idx_call_quality_user_id ON call_quality(user_id);
CREATE INDEX IF NOT EXISTS idx_call_quality_date ON call_quality(date);
CREATE INDEX IF NOT EXISTS idx_call_training_user_id ON call_training(user_id);