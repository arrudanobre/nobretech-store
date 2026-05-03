-- Harden sale receivables: one active transaction per source, while allowing
-- historical cancelled rows to remain for audit and future re-creation.

DROP INDEX IF EXISTS idx_transactions_unique_source;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active_source
  ON transactions (company_id, source_type, source_id)
  WHERE source_type IS NOT NULL
    AND source_id IS NOT NULL
    AND COALESCE(status, 'pending') <> 'cancelled';
