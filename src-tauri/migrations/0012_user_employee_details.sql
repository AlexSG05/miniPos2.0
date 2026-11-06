ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN hire_date TEXT NOT NULL DEFAULT '1970-01-01';

UPDATE users
SET hire_date = substr(created_at, 1, 10);
