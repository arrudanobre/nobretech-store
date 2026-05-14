---
name: nobretech-production-safety
description: Protect the Nobretech production environment, Railway database, local homologation database, Docker setup, dumps, restores, migrations, deploys, environment variables, secrets and destructive scripts. Use this skill whenever working with production safety, database cleanup, backups, Railway, Docker, staging/local homologation, migrations, deploys or any operation that may affect real data.
license: Complete terms in LICENSE.txt
---
# Nobretech Production Safety
You are working on the Nobretech Store ERP/CRM.
This skill applies whenever touching or discussing:
- Railway production database
- Docker/local homologation database
- database dumps
- database restores
- backups
- migrations
- destructive SQL
- cleanup scripts
- deploys
- environment variables
- secrets
- production/staging/local separation
- Vercel/Railway runtime behavior
- data correction scripts
- database credentials
- scripts that delete, update, restore or reset data
- tests that create operational data
- any task that could affect real customer, sales, stock, finance or warranty data
The Nobretech production database must never be treated as a test environment.
## Core Principle
Production is not a playground.
Never run destructive tests against Railway.
Never assume the current database is safe.
Never trust environment variables blindly.
Never run `DELETE`, `UPDATE`, `TRUNCATE`, `DROP`, `ALTER`, `pg_restore --clean`, migrations or cleanup scripts without proving the target environment first.
If there is uncertainty, stop and verify.
## Environment Model
The intended environment separation is:
- Railway = production
- Docker PostgreSQL local = homologation/test database
- localhost = must use Docker local database
- production deploy = must use Railway database intentionally
- destructive tests = only allowed on local homologation unless explicitly approved with a production-safe script
Default local database:
```txt
postgresql://nobretech:nobretech@localhost:5433/nobretech_local

Any script that modifies or deletes data must refuse to run unless it can prove it is using the intended local database, unless the user explicitly requested a production-safe maintenance operation and the script has inspection + rollback safeguards.

Absolute Production Rules

Never:

* Use Railway as a test database
* Run test sales against Railway
* Run cancellation tests against Railway
* Run cleanup scripts against Railway unless specifically designed for production maintenance
* Run destructive SQL without inspection
* Run pg_restore --clean against Railway
* Run docker compose down -v expecting it to affect Railway
* Commit .env.local
* Commit database dumps
* Commit secrets
* Print full database URLs in logs
* Paste credentials into documentation
* Disable constraints casually
* Use CASCADE blindly in production
* Drop tables or columns casually
* Delete audit/financial history casually
* Hide failed backup/restore operations
* Claim production is safe without validation

Railway Safety

Railway is production unless explicitly stated otherwise.

Before any task that might touch Railway:

1. Identify whether the operation is read-only or write/destructive.
2. Confirm the exact connection source.
3. Confirm whether the URL is public/external or internal Railway-only.
4. Never print the full connection string.
5. Never store the real URL in versioned files.
6. Prefer temporary terminal environment variables for one-off dumps.
7. For write operations, require explicit user approval and a safe script.

Allowed Railway read-only examples:

* pg_dump
* SELECT inspection queries
* schema inspection
* count queries

High-risk Railway operations:

* DELETE
* UPDATE
* TRUNCATE
* DROP
* ALTER
* CREATE INDEX CONCURRENTLY if not understood
* migrations
* restore
* cleanup scripts
* manual data correction
* cancellation/stock tests
* any app flow that creates/modifies production data

For high-risk Railway operations, require:

* inspection query
* target IDs confirmed
* BEGIN
* preview counts
* ROLLBACK first
* only then a separate approved COMMIT version
* no broad deletes
* no blind cascade
* no unbounded update

Docker Local Homologation Rules

Docker local is the correct place for destructive tests.

Expected local PostgreSQL:

host=localhost
port=5433
database=nobretech_local
user=nobretech

Before using local DB:

node scripts/check-local-database.mjs --connect

A local destructive script should require the exact local database URL when possible:

postgresql://nobretech:nobretech@localhost:5433/nobretech_local

Local scripts may create, update and delete test data if:

* they abort on Railway-like URLs
* they abort on NODE_ENV=production
* they create clearly identifiable test data
* they track created IDs
* they clean only what they created
* they use try/finally
* they validate cleanup
* they report what was created and removed

Environment Variable Rules

Treat environment variables as dangerous until verified.

Before any local app/test run, confirm:

node scripts/check-local-database.mjs --connect

The local app must not use Railway by accident.

If DATABASE_URL contains any of these in local development, stop:

railway
rlwy
monorail
proxy.rlwy.net

Never rely only on terminal export if .env.local still points to Railway.

For Next.js local development, .env.local is critical.

.env.local must point to local Docker when testing:

DATABASE_URL=postgresql://nobretech:nobretech@localhost:5433/nobretech_local

Do not commit:

* .env
* .env.local
* .env.production
* database URLs
* API keys
* access tokens
* dump files

Secret Handling

If a real credential is exposed in chat, logs, code, screenshots or commits:

1. Treat it as compromised.
2. Continue only if needed for immediate recovery.
3. Rotate the credential as soon as practical.
4. Remove the secret from files/history if committed.
5. Do not repeat the secret.
6. Do not print the full secret again.

When checking whether a URL exists, print only:

echo "DATABASE_URL length: ${#DATABASE_URL}"
echo "$DATABASE_URL" | cut -c1-30

Never output full database URLs in final reports.

Dump Rules

A dump from Railway is read-only but sensitive.

Before dump:

* ensure destination folder exists
* ensure folder is gitignored
* ensure URL is loaded only in terminal
* ensure no secret is written to a versioned file

Safe dump pattern:

mkdir -p db-dumps
pg_dump "$RAILWAY_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "db-dumps/railway-$(date +%Y%m%d-%H%M%S).dump"

After dump:

ls -lh db-dumps

A valid dump should be larger than zero bytes.

A 0B dump is failed garbage and should not be restored.

Dumps contain real data and must not be committed.

Restore Rules

Restore is destructive when using --clean.

Never run restore until the target is proven local.

Before local restore:

export DATABASE_URL="postgresql://nobretech:nobretech@localhost:5433/nobretech_local"
node scripts/check-local-database.mjs --connect

Safe local restore pattern:

pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  "db-dumps/railway-YYYYMMDD-HHMMSS.dump"

Never restore to Railway unless the user explicitly requests disaster recovery and a separate production recovery plan exists.

Never use pg_restore --clean with an unverified URL.

Migration Safety

Migrations can destroy data.

Before migration:

1. Identify target database.
2. Confirm local vs production.
3. Inspect the migration.
4. Classify as additive, destructive or data-transforming.
5. Confirm whether it can run more than once.
6. Check dependencies in code.
7. Prefer local execution first.
8. For production, require a backup/dump first when practical.
9. For production, use transaction when possible.
10. Document rollback limitations.

Additive migrations are safer:

* create table
* add nullable column
* add non-destructive index
* add constraint only after validating data

High-risk migrations:

* drop column
* rename column
* alter type
* add not-null without backfill
* delete rows
* update financial records
* cascade deletes
* rewrite sales/stock/payment history

Do not run production migrations casually.

Destructive SQL Rules

Destructive SQL includes:

* DELETE
* UPDATE
* TRUNCATE
* DROP
* ALTER
* pg_restore --clean
* scripts that remove records
* scripts that reset data
* scripts that modify stock, sales, finance or warranty records

For local homologation:

* destructive SQL is allowed if target is proven local
* still use narrow filters
* still track IDs
* still validate after

For production:

* first script must be inspection-only or BEGIN + ROLLBACK
* never COMMIT in the first pass
* require exact UUIDs or exact safe prefix rules
* no broad deletes
* no blind cascade
* no hidden side effects
* report affected counts per table

Safe production cleanup pattern:

BEGIN;
-- Inspect exact targets
SELECT ...
-- Preview affected rows per table
SELECT COUNT(*) ...
-- Perform narrow deletes only if already approved for dry-run
DELETE FROM ...
WHERE id IN (...);
-- Validate remaining rows
SELECT ...
ROLLBACK;

Only after user review should a separate COMMIT version be prepared.

Cleanup Script Rules

Cleanup scripts must be more conservative than normal application code.

Required safeguards:

* refuse Railway-like URLs unless explicitly designed for production dry-run
* refuse NODE_ENV=production
* print target database host/port/name
* use exact IDs or strict prefixes
* list targets before deleting
* use transaction
* avoid broad deletion
* avoid blind cascade in production
* validate remaining rows
* report counts removed
* never hide cleanup failure
* never mask the original test failure
* use try/finally for test cleanup

For local test data, prefer identifiable slugs/names:

teste-estoque-venda-local-

Delete only records matching the exact test prefix and/or IDs created during the test.

Test Data Rules

Tests that create data must clean their own data.

For local tests:

* create isolated company/user/customer/inventory
* use unique prefixes
* track IDs
* cleanup in finally
* verify no leftovers
* never touch real company data
* never use production customer records
* never use production sales as test targets unless restored locally

For production:

* do not create test sales
* do not test cancellation
* do not test cleanup
* do not test stock movement
* only run controlled maintenance scripts if explicitly approved

Deploy Safety

Before deploy:

1. Check git status --short.
2. Check git diff --stat.
3. Separate unrelated changes into logical blocks.
4. Identify high-risk files.
5. Run local tests.
6. Run TypeScript.
7. Run focused lint.
8. Confirm migrations required.
9. Confirm environment variables are configured.
10. Confirm no dumps/secrets are staged.
11. Confirm whether production database needs migration.
12. Confirm rollback plan.

Do not deploy huge mixed diffs without block review.

If the worktree includes unrelated changes, stop and classify:

* infrastructure/local safety
* business logic
* finance
* portal/customer-facing
* ORION
* UI-only
* migrations
* scripts
* unrelated experiments

A deploy should have a clear purpose.

Git Safety

Never commit:

* database dumps
* .env.local
* secrets
* credentials
* temporary exports
* generated sensitive reports
* local cache
* test artifacts with real data

Before commit:

git status --short
git diff --stat
git diff --check

If package-lock.json changed, explain why.

If many unrelated files changed, split commits or at least document blocks clearly.

Production Data Correction

Correcting production data is high risk.

Before correcting production records:

1. Confirm the bug is fixed in code.
2. Confirm issue reproduced locally.
3. Identify exact affected records in production with SELECT only.
4. Generate backup/dump if practical.
5. Prepare dry-run script with BEGIN + ROLLBACK.
6. Review affected rows.
7. Only then prepare COMMIT version.
8. Validate after.
9. Keep audit trail when appropriate.

Never “fix data” by clicking around production if a controlled script is required.

Never delete financial history to make screens look clean.

Customer Data and LGPD

Dumps and local restores contain real customer data.

Treat local database as sensitive.

Do not:

* upload dumps
* share dumps
* commit dumps
* expose customer CPF/phone/address unnecessarily
* screenshot sensitive customer data unless needed
* use real customer data in public examples

When possible, mask sensitive data in documentation and reports.

Handling Exposed Credentials

If a credential is exposed:

* acknowledge it as sensitive
* do not repeat it
* recommend rotation
* avoid storing it in memory or files
* check whether it was committed
* replace it in local files if needed

For Railway database credentials, rotation should happen in Railway after the local environment is stable.

Required Final Report For Production-Safety Work

When finishing a task involving environment, database, deploy, dump, restore or destructive scripts, report:

* Environment touched
* Whether Railway was touched
* Whether operation was read-only or write
* Files changed
* Commands run
* Validation performed
* Whether secrets were exposed or avoided
* Whether dumps were created
* Where dumps are stored
* Whether dumps are gitignored
* Risks remaining
* Next safe step

Do not say “safe” unless validation proves it.

Red Flags

Stop and ask for clarification or propose a safer plan if:

* user asks to delete production data “without traces”
* target database is unclear
* DATABASE_URL might be Railway
* command contains --clean
* command contains DROP
* command contains TRUNCATE
* script deletes by broad condition
* migration drops/renames columns
* there is no backup/dump for production operation
* many unrelated files are changed before deploy
* test is about cancellation/stock/finance and is pointed at production
* a credential appears in chat, logs, code or screenshot