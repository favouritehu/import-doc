-- Import Desk — control-tower schema (§4). Authored in Phase A, wired in Phase B.
-- The Phase-A dummy objects mirror these rows so the swap is mechanical.
-- Every table is InnoDB / utf8mb4 so Chinese round-trips without mojibake.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ── Masters ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(160) NOT NULL,
  country       VARCHAR(80)  NOT NULL,
  contact_name  VARCHAR(120),
  contact_phone VARCHAR(60),
  contact_email VARCHAR(160),
  bank_details  JSON,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_master (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(160) NOT NULL,
  hsn_code   VARCHAR(12)  NOT NULL,           -- financial-gated in UI
  uom        VARCHAR(16)  NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_user (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(160) NOT NULL UNIQUE,
  role       ENUM('admin','import_manager','accountant') NOT NULL DEFAULT 'import_manager',
  google_sub VARCHAR(120),                    -- OAuth subject (Phase B)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS file_template (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  mode          ENUM('sea','air') NOT NULL,
  incoterm      ENUM('FOB','CIF','CFR','EXW','DAP','OTHER') NOT NULL,
  country       VARCHAR(80),
  currency      CHAR(3) DEFAULT 'USD',
  supplier_id   INT,
  cha_name      VARCHAR(160),
  required_docs JSON,                         -- doc-type list
  default_items JSON,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Import file (one BL / one customs clearance) ───────────────────────

CREATE TABLE IF NOT EXISTS import_file (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  file_number   VARCHAR(40) NOT NULL UNIQUE,  -- auto IMP-25-0001
  country       VARCHAR(80) NOT NULL,
  mode          ENUM('sea','air') NOT NULL DEFAULT 'sea',
  incoterm      ENUM('FOB','CIF','CFR','EXW','DAP','OTHER') NOT NULL DEFAULT 'FOB',
  currency      CHAR(3) NOT NULL DEFAULT 'USD',
  is_partial    BOOLEAN NOT NULL DEFAULT FALSE,
  bl_awb        VARCHAR(60),
  port_loading  VARCHAR(120),
  port_arrival  VARCHAR(120),
  eta           DATE,
  arrived_on    DATE,
  shipping_line VARCHAR(120),
  forwarder     VARCHAR(160),
  boe_number    VARCHAR(40),
  boe_date      DATE,
  manager_id    INT,
  accountant_id INT,
  cha_name      VARCHAR(160),
  status        ENUM('draft','documents_pending','bank_work','cha_work','duty_paid','goods_received','closed')
                  NOT NULL DEFAULT 'draft',
  status_manual BOOLEAN NOT NULL DEFAULT FALSE,
  priority      ENUM('normal','high','urgent') NOT NULL DEFAULT 'normal',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (manager_id)    REFERENCES app_user(id) ON DELETE SET NULL,
  FOREIGN KEY (accountant_id) REFERENCES app_user(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS container (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id INT NOT NULL,
  container_no   VARCHAR(40),
  size_type      VARCHAR(20),                 -- e.g. 40HC
  qty            INT DEFAULT 1,
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per invoice on the BL. supplier_id CAN differ per row (multi-supplier
-- consolidations). Phase-A `Invoice` maps here; its CI/PL link via document.line_item_id.
CREATE TABLE IF NOT EXISTS import_line_item (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id INT NOT NULL,
  supplier_id    INT,
  invoice_number VARCHAR(60),
  invoice_date   DATE,
  product        VARCHAR(200),
  hsn_code       VARCHAR(12),                 -- financial-gated in UI
  qty            VARCHAR(60),
  uom            VARCHAR(16),
  goods_value    DECIMAL(15,2),
  currency       CHAR(3) DEFAULT 'USD',
  exchange_rate  DECIMAL(12,4),
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id)    REFERENCES supplier(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Documents ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id     INT NOT NULL,
  line_item_id       INT,                     -- NULL = file-level doc; set = invoice CI/PL
  doc_type           VARCHAR(40) NOT NULL,
  status             ENUM('missing','uploaded','under_review','approved','discrepant','corrected')
                       NOT NULL DEFAULT 'missing',
  version            INT NOT NULL DEFAULT 1,
  storage_key        VARCHAR(255),            -- StorageService object key (Phase B)
  uploaded_by        INT,
  approved_by        INT,
  discrepancy_reason VARCHAR(120),
  discrepancy_note   TEXT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE CASCADE,
  FOREIGN KEY (line_item_id)   REFERENCES import_line_item(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by)    REFERENCES app_user(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by)    REFERENCES app_user(id) ON DELETE SET NULL,
  INDEX idx_doc_file (import_file_id),
  INDEX idx_doc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Money ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id    INT NOT NULL,
  payment_type      ENUM('advance','balance','freight','insurance','duty','cha_charges','bank_charges','other') NOT NULL,
  currency          CHAR(3) DEFAULT 'USD',
  amount            DECIMAL(15,2),
  exchange_rate     DECIMAL(12,4),
  inr_amount        DECIMAL(15,2),
  remittance_ref    VARCHAR(80),
  proof_document_id INT,
  note              VARCHAR(255),
  due_date          DATE,
  paid_date         DATE,
  status            ENUM('pending','part_paid','paid','overdue') NOT NULL DEFAULT 'pending',
  created_by        INT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_file_id)    REFERENCES import_file(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_document_id) REFERENCES document(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)        REFERENCES app_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duty_breakup (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id INT NOT NULL UNIQUE,
  bcd            DECIMAL(15,2) NOT NULL DEFAULT 0,
  sws            DECIMAL(15,2) NOT NULL DEFAULT 0,
  igst           DECIMAL(15,2) NOT NULL DEFAULT 0,
  cess           DECIMAL(15,2) NOT NULL DEFAULT 0,
  anti_dumping   DECIMAL(15,2) NOT NULL DEFAULT 0,
  other          DECIMAL(15,2) NOT NULL DEFAULT 0,
  total          DECIMAL(15,2) AS (bcd + sws + igst + cess + anti_dumping + other) STORED,
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Customs workflow ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cha_status (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id INT NOT NULL,
  step_key       VARCHAR(40) NOT NULL,
  status         ENUM('pending','done','na') NOT NULL DEFAULT 'pending',  -- 'na' = step not applicable
  done_on        DATE,
  UNIQUE KEY uq_file_step (import_file_id, step_key),
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS note (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id INT NOT NULL,
  author_id      INT,
  author_name    VARCHAR(120),
  author_role    VARCHAR(40),
  message        TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id)      REFERENCES app_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── External access + audit ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS access_link (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  import_file_id  INT NOT NULL,
  token           CHAR(64) NOT NULL UNIQUE,
  party_type      ENUM('cha','supplier','forwarder') NOT NULL,
  lang            CHAR(5) NOT NULL DEFAULT 'zh-CN',
  allowed_actions JSON,
  expires_at      TIMESTAMP NULL,
  revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only: the API performs INSERT only (no UPDATE / DELETE).
CREATE TABLE IF NOT EXISTS audit_log (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  import_file_id INT,
  actor          VARCHAR(120),
  action         VARCHAR(80) NOT NULL,
  entity         VARCHAR(40),
  entity_id      VARCHAR(40),
  detail         JSON,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_file_id) REFERENCES import_file(id) ON DELETE SET NULL,
  INDEX idx_audit_file (import_file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
