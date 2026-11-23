-- ============================================================================
-- ACEDA SaaS & BI — Migration 001 : Schéma Multi-Tenant & Onboarding Écoles
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Établissements (Tenants)
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    tenant_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    country VARCHAR(100) DEFAULT 'Tunisie',
    city VARCHAR(100) NOT NULL,
    address VARCHAR(500),
    total_capacity INTEGER NOT NULL DEFAULT 250,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schools ADD COLUMN IF NOT EXISTS tenant_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Tunisie';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS address VARCHAR(500);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_tenant_uuid ON schools(tenant_uuid);

-- 2. Utilisateurs (RBAC + Super Admin global si school_id IS NULL)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) UNIQUE,
    phone VARCHAR(50),
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('super_admin', 'admin', 'director', 'teacher', 'accountant', 'parent', 'student')),
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE users SET username = LOWER(email) WHERE username IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_school_role ON users(school_id, role);

-- 3. Référentiels Académiques (Matières, Classes, Affectations, Emplois du temps)
CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    coefficient NUMERIC(4, 2) NOT NULL DEFAULT 1.00
);
CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    level VARCHAR(100) NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 30,
    room_name VARCHAR(100) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);

CREATE TABLE IF NOT EXISTS teacher_assignments (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    weekly_hours INTEGER NOT NULL DEFAULT 2,
    UNIQUE (school_id, teacher_id, class_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_ta_school_teacher ON teacher_assignments(school_id, teacher_id);

CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room_name VARCHAR(100) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_school_day ON schedules(school_id, day_of_week);

-- 4. Élèves, Notes, Assiduité, Paiements & Messagerie
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    city VARCHAR(100),
    enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dropped', 'graduated'))
);
CREATE INDEX IF NOT EXISTS idx_students_school_status ON students(school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_parent ON students(parent_id);

CREATE TABLE IF NOT EXISTS grades (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    trimester INTEGER NOT NULL CHECK (trimester BETWEEN 1 AND 3),
    score NUMERIC(5, 2) NOT NULL CHECK (score BETWEEN 0 AND 20),
    recorded_at DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_grades_school_student ON grades(school_id, student_id);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('absence', 'late')),
    hours_missed NUMERIC(4, 2) NOT NULL,
    justified BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_attendance_school_student ON attendance(school_id, student_id);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    amount_due NUMERIC(10, 2) NOT NULL,
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    due_date DATE NOT NULL,
    paid_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'partial' CHECK (status IN ('paid', 'partial', 'overdue'))
);
CREATE INDEX IF NOT EXISTS idx_payments_school_status ON payments(school_id, status);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_school_parent ON messages(school_id, receiver_parent_id);

-- 5. Tables d'Onboarding Multi-Tenant & Gouvernance Super Admin
CREATE TABLE IF NOT EXISTS school_registration_requests (
    id SERIAL PRIMARY KEY,
    request_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    school_name VARCHAR(200) NOT NULL,
    school_email VARCHAR(255) NOT NULL,
    school_phone VARCHAR(50) NOT NULL,
    country VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address VARCHAR(500) NOT NULL,
    admin_full_name VARCHAR(200) NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    admin_phone VARCHAR(50) NOT NULL,
    requested_username VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    rejection_reason VARCHAR(500),
    approved_school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_school_name
    ON school_registration_requests (LOWER(TRIM(school_name)))
    WHERE status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_username
    ON school_registration_requests (LOWER(TRIM(requested_username)))
    WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS school_settings (
    school_id INTEGER PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
    academic_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
    grading_scale NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'TND',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Tunis',
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_activation_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_user ON account_activation_tokens(user_id);

CREATE TABLE IF NOT EXISTS email_delivery_logs (
    id SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    email_type VARCHAR(60) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    provider VARCHAR(40) NOT NULL DEFAULT 'resend',
    provider_message_id VARCHAR(120),
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    related_request_id INTEGER REFERENCES school_registration_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);