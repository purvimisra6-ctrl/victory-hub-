-- =========================================================
-- COMPANY HUB - Database Schema (PostgreSQL)
-- Unlimited-level referral tree (adjacency list + recursive CTE)
-- =========================================================

CREATE TABLE IF NOT EXISTS associates (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    referral_code   VARCHAR(20) UNIQUE NOT NULL,   -- code others use to join under this associate
    parent_id       INTEGER REFERENCES associates(id) ON DELETE SET NULL, -- who referred them (NULL = top of company)
    role            VARCHAR(20) NOT NULL DEFAULT 'associate', -- 'admin' | 'associate'
    status          VARCHAR(20) NOT NULL DEFAULT 'active',    -- 'active' | 'inactive' | 'blocked'
    city            VARCHAR(100),
    profile_note    TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_associates_parent ON associates(parent_id);

-- Commission % per referral-level (level 1 = direct upline, level 2 = upline of upline, etc.)
-- Unlimited levels are supported: any level without a row here gets 0%.
CREATE TABLE IF NOT EXISTS commission_settings (
    level           INTEGER PRIMARY KEY,
    percentage      NUMERIC(5,2) NOT NULL
);

-- Bookings / Sales entered against the associate who made the sale (self business)
CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
    associate_id    INTEGER NOT NULL REFERENCES associates(id) ON DELETE CASCADE,
    customer_name   VARCHAR(150) NOT NULL,
    customer_phone  VARCHAR(20),
    project_name    VARCHAR(150),
    plot_no         VARCHAR(50),
    sqft            NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    booking_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'confirmed', -- 'pending' | 'confirmed' | 'cancelled'
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_associate ON bookings(associate_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);

-- Payout = commission earned (auto-generated from bookings up the referral chain)
CREATE TABLE IF NOT EXISTS payouts (
    id                  SERIAL PRIMARY KEY,
    associate_id        INTEGER NOT NULL REFERENCES associates(id) ON DELETE CASCADE, -- who earns the commission
    booking_id          INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    source_associate_id INTEGER NOT NULL REFERENCES associates(id) ON DELETE CASCADE, -- whose sale generated it
    level               INTEGER NOT NULL,          -- 0 = own sale, 1 = direct downline, 2 = 2nd level, ...
    percentage_applied  NUMERIC(5,2) NOT NULL,
    amount              NUMERIC(14,2) NOT NULL,
    payout_month        VARCHAR(7) NOT NULL,        -- 'YYYY-MM' for monthly reports
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'paid'
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_associate ON payouts(associate_id);
CREATE INDEX IF NOT EXISTS idx_payouts_month ON payouts(payout_month);

-- Actual money transferred to an associate (against approved payouts)
CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,
    associate_id    INTEGER NOT NULL REFERENCES associates(id) ON DELETE CASCADE,
    amount          NUMERIC(14,2) NOT NULL,
    payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    mode            VARCHAR(30) DEFAULT 'bank_transfer',
    reference_no    VARCHAR(100),
    notes           TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_associate ON payments(associate_id);

-- Plot / inventory status (simple version - extend as needed)
CREATE TABLE IF NOT EXISTS plots (
    id              SERIAL PRIMARY KEY,
    project_name    VARCHAR(150) NOT NULL,
    plot_no         VARCHAR(50) NOT NULL,
    sqft            NUMERIC(12,2),
    status          VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available' | 'booked' | 'sold' | 'hold'
    booking_id      INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Session store table for express-session (connect-pg-simple creates this automatically too)
