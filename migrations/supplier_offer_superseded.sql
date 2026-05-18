-- Add superseded status to supplier_offers and batch metadata fields
-- Run after supplier_offer_opportunities.sql

-- Extend status CHECK constraint to include superseded
ALTER TABLE supplier_offers DROP CONSTRAINT IF EXISTS supplier_offers_status_check;

ALTER TABLE supplier_offers ADD CONSTRAINT supplier_offers_status_check
  CHECK (status IN (
    'draft',
    'available',
    'needs_review',
    'ignored',
    'unavailable',
    'reserved_with_supplier',
    'converted_to_inventory',
    'canceled',
    'superseded'
  ));

-- Batch metadata for audit/display
ALTER TABLE supplier_offer_batches
  ADD COLUMN IF NOT EXISTS parser_mode TEXT NULL,
  ADD COLUMN IF NOT EXISTS ai_succeeded_blocks INTEGER NULL,
  ADD COLUMN IF NOT EXISTS ai_failed_blocks INTEGER NULL,
  ADD COLUMN IF NOT EXISTS local_fallback_blocks INTEGER NULL,
  ADD COLUMN IF NOT EXISTS saved_count INTEGER NULL;
