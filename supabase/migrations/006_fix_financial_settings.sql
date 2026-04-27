-- Add missing credit fee columns to financial_settings
ALTER TABLE financial_settings 
ADD COLUMN IF NOT EXISTS credit_5x_fee_pct DECIMAL(5,2) DEFAULT 4.99,
ADD COLUMN IF NOT EXISTS credit_7x_fee_pct DECIMAL(5,2) DEFAULT 5.99,
ADD COLUMN IF NOT EXISTS credit_8x_fee_pct DECIMAL(5,2) DEFAULT 6.49,
ADD COLUMN IF NOT EXISTS credit_9x_fee_pct DECIMAL(5,2) DEFAULT 6.99,
ADD COLUMN IF NOT EXISTS credit_11x_fee_pct DECIMAL(5,2) DEFAULT 8.19;