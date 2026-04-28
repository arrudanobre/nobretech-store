import * as dotenv from "dotenv"
import path from "path"

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })
dotenv.config()

import { pool } from "./src/lib/db"

async function run() {
  try {
    console.log("Ensuring extensions and creating transactions table...");
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    await pool.query(`
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
    `);
    
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_company ON transactions (company_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);`);
    
    // Attempt to enable RLS if it's available, otherwise ignore
    try {
      await pool.query(`ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;`);
      await pool.query(`DROP POLICY IF EXISTS "data_access_transactions" ON transactions;`);
      await pool.query(`CREATE POLICY "data_access_transactions" ON transactions FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));`);
    } catch (err: any) {
      console.log("Ignoring RLS error (auth schema might not exist in direct PG connection):", err.message);
    }

    console.log("Success");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
