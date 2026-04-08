# Fix "Sem catálogo" in Inventory

## Context
Products saved via `/estoque/novo` show as "Sem catálogo" because:
1. `product_catalog` has RLS enabled but no INSERT policy — the lookup/create in the new product form silently fails
2. Existing products were saved with `catalog_id: null` by the old code
3. Category filter buttons don't work because `catalog` is always null, so filtering by category returns empty

The `004_fix_catalog_rls.sql` only had `FOR SELECT`. The insert step in the product form fails silently.

## Plan

### Step 1: Fix RLS policy on product_catalog
Run this SQL (replace current policy):
```sql
DROP POLICY IF EXISTS "catalog_public_read" ON product_catalog;
CREATE POLICY "catalog_all_auth" ON product_catalog
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

`FOR ALL` covers SELECT, INSERT, UPDATE, DELETE — all needed by the product wizard.

### Step 2: Diagnose existing products
Existing products have `catalog_id: null` from old code. Run in Supabase SQL Editor:
```sql
SELECT id, catalog_id, purchase_price, created_at FROM inventory ORDER BY created_at DESC LIMIT 10;
SELECT * FROM product_catalog;
```

This will tell us if the catalog lookup is matching and if old items have null catalog_ids.

### Step 3: Verify fix
After Step 1, create a NEW product. The catalog should now appear correctly in the listing and detail pages.

## Files Modified
- None for code changes — this is purely a database policy fix
- Supabase SQL Editor to run the corrected policy
- Existing code (`/estoque/page.tsx`, `/estoque/[id]/page.tsx`, `/estoque/novo/page.tsx`) is already correct; just needs the DB policy to allow the catalog insert to succeed
