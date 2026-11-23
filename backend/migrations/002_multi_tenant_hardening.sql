-- ============================================================================
-- ACEDA SaaS & BI — Migration 002 : Durcissement Concurrence & Unicité Multi-Tenant
-- ============================================================================
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_school_email
    ON school_registration_requests (LOWER(TRIM(school_email)))
    WHERE status IN ('PENDING', 'APPROVED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_admin_email
    ON school_registration_requests (LOWER(TRIM(admin_email)))
    WHERE status IN ('PENDING', 'APPROVED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_approved_school_name
    ON school_registration_requests (LOWER(TRIM(school_name)))
    WHERE status = 'APPROVED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_approved_username
    ON school_registration_requests (LOWER(TRIM(requested_username)))
    WHERE status = 'APPROVED';

ALTER TABLE school_settings
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_logs_request_id
    ON email_delivery_logs(related_request_id);

COMMIT;