---
name: nobretech-business-rules
description: Preserve and implement the real business rules of Nobretech ERP, including sales, inventory, payments, receivables, reconciled cash balance, DRE, trade-in, warranty, customer portal and ORION AI data interpretation. Use this skill whenever modifying backend, frontend, database, queries, migrations, APIs, calculations, reports or any flow that affects business meaning.
license: Complete terms in LICENSE.txt
---

# Nobretech Business Rules

You are working on the Nobretech Store ERP/CRM.

This system is not a generic store app.

Nobretech sells Apple-focused products, mainly iPhones, iPads, MacBooks, Apple Watch and accessories. The system handles sales, inventory, payments, receivables, finance, DRE, CRM, campaigns, trade-ins, warranties, customer transparency portal and ORION AI executive analysis.

Your priority is to preserve the real business rules.

A beautiful implementation with wrong business logic is a failure.

## Core Principle

Never guess business rules.

Never simplify financial, stock, sales, payment, warranty or DRE logic just to make code easier.

Never replace deterministic business calculations with AI-generated reasoning.

If a value affects money, stock, profit, customer obligation, warranty, receivable, balance, DRE or traceability, it must come from the correct source of truth.

## Absolute Rules

Do not change business meaning casually.

Do not introduce fake calculations.

Do not hardcode operational values.

Do not infer critical status from display text when structured fields exist.

Do not duplicate financial recognition.

Do not count the same sale twice.

Do not mix real cash and projected cash.

Do not treat every inventory item as available.

Do not create provisional/gambiarra logic when the real need is already known.

Do not implement "base prepared" when the correct final behavior is known and requested.

## Source of Truth Mental Model

Use the correct source of truth for each domain.

### Cash Balance

The official cash balance comes from reconciled financial movements.

Use `financial_account_movements` as the source of truth for reconciled cash/balance when available.

The latest valid `balance_after` from non-canceled reconciled movements represents real cash balance.

Do not calculate real balance only from sales.

Do not mix pending receivables with real cash.

### Sales

Sales represent commercial transactions.

A sale may include:

- Device
- Accessory
- Upsell
- Gift/brinde
- Trade-in credit
- Freight
- Other costs
- Payment method
- Installments
- Warranty
- Customer portal token/PIN
- Receipt/warranty documents

Do not assume sale total equals cash received immediately.

Do not assume every sale creates immediate cash movement.

### Payments

`sale_payments` is the source of truth for split payments when present.

Each sale payment may create or relate to a transaction.

Do not duplicate payment records.

Do not create multiple financial recognitions for the same payment.

Do not show two competing payment states in the UI.

Do not infer payment truth from label text if payment rows exist.

### Transactions

`transactions` represent financial expectations, receivables or payable/receivable records.

A transaction may be pending before it is reconciled.

Do not treat pending transaction as reconciled cash.

Transactions linked to sales or sale payments must not be counted twice in DRE or cash calculations.

### Reconciliation

Reconciliation is the moment projected money becomes real movement.

Only reconciled entries should affect official cash balance.

A pending card receivable, pix not confirmed or future installment must not inflate real cash.

### DRE

DRE must represent business performance without duplication.

Do not double count:

- Sale revenue
- Split payment rows
- Transactions created from sale payments
- Receivables and reconciled movements for the same event

DRE must distinguish revenue, expenses, neutral movements and owner/equity movements when applicable.

Card machine fees passed to the customer should not be treated as Nobretech expense unless the business rule explicitly says so.

### Inventory

Inventory is controlled per unit.

Do not assume a quantity column.

Each row generally represents one unit.

Stock statuses matter.

Only operationally available statuses should be treated as sellable.

Statuses may include:

- pending
- active
- in_stock
- sold
- returned
- under_repair
- trade_in_received
- reserved

Do not treat sold, returned, under repair or unavailable items as available.

Do not infer availability only from product name.

### Product Type

Product type should use structured data first.

Prefer:

- `product_type`
- category
- subcategory
- IMEI/serial presence
- variation data
- accessory/category markers

Do not decide "device" or "accessory" purely by commercial name unless it is the final fallback.

Correct priority:

1. Explicit `product_type`
2. Category/subcategory
3. Accessory markers
4. IMEI/serial presence
5. Variation/accessory structure
6. Name fallback only when no reliable structured data exists

### Trade-in

Trade-in credit is a commercial offset.

It reduces what the customer pays, but it is not automatically cash received.

Do not treat trade-in credit as revenue.

Do not generate extrato movement merely because trade-in credit exists.

Trade-in received stock must be tracked properly as inventory/trade-in item when applicable.

If trade-in credit exceeds sale value, the UI and backend must handle the operational decision explicitly.

### Warranty

Warranty rules depend on product condition and business context.

Used products may have Nobretech warranty, often 6 months.

Sealed Apple products may have official Apple warranty validated at activation/serial check.

Do not invent warranty dates.

Do not expose warranty as valid if the date/status is missing or uncertain.

Warranty documents and customer portal data must match the sale.

### Customer Transparency Portal

The customer portal is proof of trust.

It may show:

- Sale data
- Product data
- Warranty status
- Receipt download
- Warranty term download
- Masked IMEI/serial
- Masked previous owner data when supported
- Purchase traceability
- Packaging info
- Included accessories
- OS/assistance status when linked

Do not expose sensitive data.

Previous owner name/CPF must be masked.

Do not show internal admin-only data.

Do not show raw database fields.

The portal must be customer-safe and LGPD-conscious.

### Marketing and CRM

CRM exists to support sales.

Lead data must preserve:

- Name
- Phone/email
- Source
- Campaign
- Product of interest
- Status
- Temperature
- Last interaction
- Next action
- Follow-up urgency

Do not convert CRM into a passive generic table.

Do not lose campaign attribution.

Do not hardcode status meanings in a way that conflicts with existing values.

### ORION AI

ORION is the executive intelligence layer of Nobretech.

ORION may explain, interpret and recommend, but it must not invent numbers.

Numerical conclusions must come from deterministic engines, database queries or validated context builders.

ORION should use real system data for:

- Finance
- Sales
- Inventory
- CRM
- Campaigns
- DRE
- Cashflow
- Pricing
- Leads
- Risk
- Recommendations

ORION must not confuse:

- Real cash with receivables
- Revenue with profit
- Pending with received
- Sold stock with available stock
- Trade-in credit with cash
- Card fees passed to customer with company expenses

ORION answers should be human, strategic, direct and data-grounded.

## Financial Display Rules

When displaying money, make the type clear.

Examples:

- Real cash balance
- Pending receivables
- Overdue receivables
- Sale total
- Customer total
- Nobretech receivable
- Gross revenue
- Net profit
- Margin
- Trade-in credit
- Freight
- Other costs
- Card fee
- Discount
- Gift cost
- Owner/equity movement
- Reconciled movement

Do not show ambiguous labels like "total" when multiple totals exist.

## Payment Rules

Payment method affects meaning.

Common cases:

- Pix
- Cash
- Debit
- Credit card
- Split payment
- Installments
- Reservation
- Pending receivable

For card payments:

- Nobretech may receive D+1 regardless of customer installment count
- Customer may pay in installments
- Fees may be passed to customer
- Installment display must show customer total and parcel value
- Backend must preserve the amount Nobretech receives

Do not assume parcel count changes Nobretech receipt date unless the business rule says so.

## Discounts, Costs and Gifts

Discounts reduce customer total.

Costs reduce profit.

Gifts/brindes may affect margin depending on cost tracking.

Freight and other costs must parse decimal values correctly.

Brazilian decimal comma must not turn cents into thousands.

Examples:

- `85,18` means eighty-five reais and eighteen cents
- It must not become `8518`
- It must not become `8.518`
- It must not become `85.180`

Currency inputs must handle comma and dot safely.

## Database and Migration Rules

Be conservative with database changes.

Before changing schema:

1. Check existing table/column names
2. Check relationships
3. Check current business flow
4. Avoid destructive migrations
5. Prefer additive migrations when possible
6. Use safe defaults
7. Avoid cascade deletes unless explicitly justified
8. Preserve historical financial data
9. Do not rename columns casually
10. Do not drop data without explicit instruction

For critical migrations, prefer dry-run or transaction validation when possible.

Use `BEGIN` and `ROLLBACK` validation when appropriate.

## Query Rules

Queries must match business meaning.

Do not write broad queries that accidentally include:

- sold stock as available
- canceled transactions as valid
- pending money as real cash
- duplicated sale payments
- deleted/inactive rows
- returned items as active revenue
- owner movements as operational profit

Filtering is business logic.

Bad filters create bad decisions.

## Frontend/Backend Boundary

Frontend may format and present.

Backend or deterministic helpers should calculate business-critical values.

Do not move business-critical calculations into UI components unless they already exist there and the task is to preserve behavior.

When fixing UI, avoid changing backend meaning.

When fixing backend, make frontend impacts explicit.

## Refactoring Rules

When refactoring business code:

- Preserve current behavior unless explicitly changing it
- Add tests or validation when possible
- Avoid broad rewrites
- Avoid changing names without need
- Avoid removing edge cases
- Avoid simplifying away real business rules
- Keep legacy compatibility where needed
- Explain any behavior change clearly

If a refactor changes financial meaning, it is not just a refactor. It is a business rule change.

## Anti-Gambiarra Rule

Do not implement temporary placeholders when the real required behavior is already known.

Bad:

- "Prepare structure for date filter later"
- "Mock the result for now"
- "Hardcode this until backend exists"
- "Use a generic status because it is easier"
- "Leave financial logic approximate"
- "Use name matching because structured data is annoying"

Good:

- Implement the real selector/filter
- Use the real source of truth
- Add the necessary query
- Preserve deterministic calculations
- Make limitations explicit

## Error Handling

Errors must be honest and operationally useful.

Avoid vague messages like:

- "Something went wrong"
- "Invalid data"
- "Error processing"

Prefer messages that help the user fix the issue:

- "Informe o valor do frete em reais"
- "Selecione uma forma de pagamento"
- "Este item não está disponível para venda"
- "Não foi possível reconciliar porque a transação já está cancelada"
- "A venda não possui pagamento vinculado"

## Testing and Validation

After changes, validate according to risk.

For frontend-only UI changes:

- Type check/build when possible
- Check responsive layout
- Check main user flow
- Check empty/error/loading states

For business logic changes:

- Validate affected query
- Validate edge cases
- Validate money calculations
- Validate status filtering
- Validate no duplicate counting
- Validate old records still work

For finance changes:

- Confirm real cash balance
- Confirm pending receivables
- Confirm DRE does not duplicate
- Confirm reconciliation behavior
- Confirm canceled records are excluded

For sales changes:

- Test sale with one payment
- Test split payment
- Test card installment
- Test trade-in
- Test discount
- Test freight/other costs with decimal comma
- Test gift/upsell where applicable

## Final Response Format

When reporting work, include:

- Files changed
- Business rule affected
- What was preserved
- What changed
- Validation performed
- Known risks or limitations
- How to test manually

Do not oversell.

Do not say "everything is perfect."

Be explicit if something was not tested.