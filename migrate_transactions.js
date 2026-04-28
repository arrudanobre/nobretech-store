const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => {
  return client.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      category TEXT NOT NULL,
      description TEXT,
      amount DECIMAL(10,2) NOT NULL,
      date DATE NOT NULL,
      payment_method TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_company ON transactions (company_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
    ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "data_access_transactions" ON transactions;
    CREATE POLICY "data_access_transactions" ON transactions FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));
  `);
}).then(() => {
  console.log("Success");
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
