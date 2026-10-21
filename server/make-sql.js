// Generates ../database/calling_crm.sql (import it in phpMyAdmin).  Run: npm --prefix server run db:sql
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const SCHEMA = require('./src/schema');
const TRIGGERS = require('./src/triggers');

const hash = bcrypt.hashSync('admin123', 10);
const sql = `-- ============================================================
--  WealthFund Calling CRM — MySQL / MariaDB (XAMPP) database
--  How to use:  phpMyAdmin -> Import -> choose this file -> Go
--  (It creates the database "calling_crm", all tables and the first admin.)
--  First login:  Admin panel  ->  mobile 9999999999  /  password admin123
-- ============================================================

CREATE DATABASE IF NOT EXISTS \`calling_crm\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`calling_crm\`;
SET NAMES utf8mb4;

${SCHEMA.map((s) => s.replace(/\n  /g, '\n  ') + ';').join('\n\n')}

-- Triggers: leads.executive_name / calls.executive_name always follow users.name
DELIMITER $$
${TRIGGERS.map(([n, s]) => `DROP TRIGGER IF EXISTS ${n}$$\n${s}$$`).join('\n')}
DELIMITER ;

-- First admin (change the mobile number and password after login: sidebar -> Account settings)
INSERT INTO users (name, phone, password_hash, role)
SELECT 'Admin', '9999999999', '${hash}', 'admin' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users);
`;
fs.mkdirSync(path.join(__dirname, '..', 'database'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'database', 'calling_crm.sql'), sql);
console.log('database/calling_crm.sql written');
