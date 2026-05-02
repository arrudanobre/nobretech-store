-- Compra Verificada Nobretech
-- Adds a public, token-based purchase portal protected by a 6 digit PIN.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS public_access_token TEXT,
  ADD COLUMN IF NOT EXISTS public_access_pin CHAR(6),
  ADD COLUMN IF NOT EXISTS public_access_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS public_access_created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS public_access_last_viewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS public_access_failed_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_access_locked_until TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_public_access_token_unique
  ON sales (public_access_token)
  WHERE public_access_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_public_access_token_enabled
  ON sales (public_access_token, public_access_enabled)
  WHERE public_access_token IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_public_access_pin_digits_check'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_public_access_pin_digits_check
      CHECK (public_access_pin IS NULL OR public_access_pin ~ '^[0-9]{6}$');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION fn_nobretech_public_access_token()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ntcv_' || translate(
    encode(gen_random_bytes(24), 'base64'),
    '+/=',
    'xyz'
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_nobretech_public_access_pin()
RETURNS CHAR(6) AS $$
BEGIN
  RETURN lpad(floor(random() * 1000000)::int::text, 6, '0')::char(6);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_ensure_sale_public_access()
RETURNS TRIGGER AS $$
DECLARE
  candidate_token TEXT;
BEGIN
  IF COALESCE(NEW.sale_status, 'completed') <> 'completed' THEN
    IF NEW.public_access_token IS NULL AND NEW.public_access_pin IS NULL THEN
      NEW.public_access_enabled := FALSE;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.public_access_enabled IS NULL
    OR NEW.public_access_token IS NULL
    OR NEW.public_access_pin IS NULL THEN
    NEW.public_access_enabled := TRUE;
  END IF;

  IF NEW.public_access_created_at IS NULL THEN
    NEW.public_access_created_at := NOW();
  END IF;

  IF NEW.public_access_pin IS NULL THEN
    NEW.public_access_pin := fn_nobretech_public_access_pin();
  END IF;

  IF NEW.public_access_token IS NULL THEN
    LOOP
      candidate_token := fn_nobretech_public_access_token();
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM sales
        WHERE public_access_token = candidate_token
          AND id IS DISTINCT FROM NEW.id
      );
    END LOOP;
    NEW.public_access_token := candidate_token;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_public_access_insert ON sales;
CREATE TRIGGER trg_sales_public_access_insert
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION fn_ensure_sale_public_access();

DROP TRIGGER IF EXISTS trg_sales_public_access_completed ON sales;
CREATE TRIGGER trg_sales_public_access_completed
  BEFORE UPDATE OF sale_status ON sales
  FOR EACH ROW
  WHEN (NEW.sale_status = 'completed')
  EXECUTE FUNCTION fn_ensure_sale_public_access();

DO $$
DECLARE
  sale_row RECORD;
  candidate_token TEXT;
BEGIN
  FOR sale_row IN
    SELECT id
    FROM sales
    WHERE COALESCE(sale_status, 'completed') = 'completed'
      AND (
        public_access_token IS NULL
        OR public_access_pin IS NULL
        OR public_access_enabled IS NULL
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM sales WHERE id = sale_row.id AND public_access_token IS NULL
    ) THEN
      LOOP
        candidate_token := fn_nobretech_public_access_token();
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM sales WHERE public_access_token = candidate_token
        );
      END LOOP;

      UPDATE sales
      SET public_access_token = candidate_token
      WHERE id = sale_row.id
        AND public_access_token IS NULL;
    END IF;

    UPDATE sales
    SET public_access_pin = COALESCE(public_access_pin, fn_nobretech_public_access_pin()),
        public_access_enabled = TRUE,
        public_access_created_at = COALESCE(public_access_created_at, NOW()),
        public_access_failed_attempts = COALESCE(public_access_failed_attempts, 0)
    WHERE id = sale_row.id
      AND COALESCE(sale_status, 'completed') = 'completed';
  END LOOP;

  UPDATE sales
  SET public_access_enabled = FALSE
  WHERE COALESCE(sale_status, 'completed') <> 'completed'
    AND public_access_token IS NULL
    AND public_access_pin IS NULL;
END
$$;
