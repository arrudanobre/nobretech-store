---
name: nobretech-finance-engineering
description: Implement and preserve financial logic in Nobretech ERP, including sales revenue, payments, split payments, receivables, reconciled cash balance, financial account movements, DRE, card fees, trade-in offsets, costs, profit, margin and reporting. Use this skill whenever modifying finance, sales payment logic, DRE, cashflow, reconciliation, financial queries, migrations, reports or ORION financial interpretation.
license: Complete terms in LICENSE.txt
---

# Nobretech Finance Engineering

You are working on the financial logic of the Nobretech Store ERP.

This skill applies whenever touching:

- Finance module
- Sales payment logic
- Split payments
- Receivables
- Transactions
- Financial account movements
- Reconciliation
- DRE
- Cash balance
- Profit
- Margin
- Costs
- Discounts
- Freight
- Card fees
- Trade-in offsets
- Marketing ROI
- ORION financial analysis
- Financial reports
- Financial migrations or queries

Financial logic is high risk.

A small mistake can create false profit, duplicated revenue, wrong cash balance or bad business decisions.

## Core Principle

Never mix money with different meanings.

Every financial value must answer:

1. Is this real cash or projected money?
2. Is this gross or net?
3. Is this customer-paid or Nobretech-received?
4. Is this sale-level or payment-level?
5. Is this pending or reconciled?
6. Is this revenue, cost, expense, neutral movement or owner/equity movement?
7. Is this counted once or duplicated through joins?
8. Is this operational performance or cashflow?

If the answer is unclear, the implementation is unsafe.

## Financial Sources of Truth

Use the correct source of truth.

### Reconciled Cash Balance

The official real cash balance comes from `financial_account_movements`.

The latest valid non-canceled `balance_after` is the reference for real cash balance.

Do not calculate official cash balance from sales.

Do not calculate official cash balance from pending transactions.

Do not calculate official cash balance from receivables.

Do not inflate cash with projected money.

### Transactions

`transactions` represent financial expectations, receivables, payables or financial records.

A transaction may be pending, paid, canceled or reconciled depending on current schema/status.

Pending transactions are not real cash.

Do not treat pending transactions as money already in the account.

### Sale Payments

`sale_payments` is the source of truth for split payments when present.

A sale can have one or multiple payment rows.

Each payment row may create or relate to a transaction.

Do not duplicate revenue by counting both sale total and sale payment transactions unless the report explicitly requires both and deduplicates correctly.

### Sales

A sale is a commercial event.

A sale can generate revenue, but not necessarily immediate cash.

Sales can include:

- Product value
- Discount
- Freight
- Other costs
- Gift/brinde costs
- Upsells
- Trade-in credit
- Payment method
- Installments
- Receivables
- Warranty

Sale total is not automatically real cash.

### Financial Account Movements

`financial_account_movements` represent reconciled account movement and are used for official account balance.

Use these for real balance, reconciled cash history and extrato.

Do not duplicate movements for the same event.

Do not create account movement before reconciliation unless the business rule explicitly requires it.

## Cash vs Receivables

Real cash and receivables must be separate.

Real cash:

- Already reconciled
- Already entered the account
- Reflected in financial account movements
- Can affect official balance

Receivables:

- Expected money
- Pending payment
- Future card settlement
- Not yet reconciled
- Must not inflate official cash balance

UI, reports and ORION must label them separately.

Bad labels:

- "Total em caixa" when it includes receivables
- "Saldo" when it includes pending payments
- "Recebido" for pending card transactions
- "Lucro realizado" before sale/payment state supports it

Good labels:

- "Caixa real"
- "Valores a receber"
- "Recebíveis pendentes"
- "Recebido/reconciliado"
- "Previsto"
- "Vencido"
- "A vencer"

## D+1 and Card Payments

For Nobretech, card payments may settle D+1 regardless of customer installment count.

Customer installment count affects how the customer pays.

It does not necessarily mean Nobretech receives over multiple months.

Do not assume 3x, 6x or 18x means Nobretech receives in 3, 6 or 18 monthly installments.

If business rule says D+1:

- due date should reflect D+1 settlement
- receivable should be expected accordingly
- customer installment display must still show parcel value and customer total

Separate:

- Customer payment experience
- Nobretech settlement behavior
- Card fee handling
- Receivable due date

## Card Fees

Card fees may be passed to the customer.

If card fee is passed to customer:

- It increases customer total
- It should not automatically be treated as Nobretech operating expense
- It must not reduce margin unless Nobretech actually absorbs the fee
- DRE must not classify passed-through fee as company expense unless explicitly required

Always distinguish:

- Customer total with fees
- Nobretech expected receivable
- Actual card processor fee
- Fee absorbed by Nobretech
- Fee passed to customer

## Revenue Recognition

Do not duplicate revenue.

Potential duplication sources:

- `sales.total`
- `sale_payments.amount`
- `transactions` linked to sales
- `financial_account_movements` linked to reconciled transactions
- DRE category records
- Manual account movements

Before counting revenue, define the report intent:

- Sales performance
- Cashflow
- DRE
- Receivables
- Reconciled account balance
- Payment method breakdown

Each report has different rules.

Revenue in DRE is not always the same as cash received in extrato.

Cashflow and DRE are not identical.

## Profit and Margin

Profit must come from complete and correct inputs.

Profit may consider:

- Sale price
- Product cost
- Accessory cost
- Gift/brinde cost
- Freight
- Other costs
- Discount
- Trade-in impact
- Fees absorbed by Nobretech
- Upsell revenue and cost

Do not calculate margin from customer total if that total includes pass-through fees that are not revenue.

Do not calculate profit using incomplete item cost.

Do not silently ignore missing costs.

If cost is missing, UI/report should make uncertainty visible.

## Discounts

Discounts reduce what the customer pays.

They may reduce gross revenue and margin.

Do not treat discount as an expense unless the DRE model explicitly defines it that way.

Do not lose discount information when calculating final customer total.

## Freight and Other Costs

Freight and other costs must be parsed safely.

Brazilian decimal comma matters.

Correct:

- `85,18` => `85.18`
- `38,50` => `38.50`
- `1.234,56` => `1234.56`

Wrong:

- `85,18` => `8518`
- `85,18` => `8.518`
- `85,18` => `85180`

Use a shared currency parser/helper.

Do not implement isolated parsing logic in one field if the same bug can exist elsewhere.

## Trade-in

Trade-in credit is not cash.

Trade-in credit is a commercial offset in the sale.

It reduces what the customer pays.

It does not create cash movement by itself.

Do not classify trade-in credit as revenue.

Do not add trade-in credit to cash balance.

Do not create extrato movement simply because trade-in credit exists.

If a trade-in device enters inventory, that must be represented as inventory/trade-in received according to system rules.

## Gifts and Upsells

A gift/brinde can affect profit if it has cost.

An upsell can add revenue and cost.

Do not treat every accessory as free.

Do not treat every included item as charged.

The UI/report must distinguish:

- Charged accessory
- Gift/brinde
- Upsell
- Included kit
- Product cost
- Gift cost
- Additional revenue

## DRE Rules

DRE is for performance, not simple bank balance.

DRE must avoid duplicate counting.

DRE should classify movements according to plan/category rules.

Distinguish:

- Receita operacional
- Custo do produto vendido
- Despesas operacionais
- Marketing
- Fees actually absorbed
- Neutral transfers
- Owner/equity movements
- Non-operational adjustments

Do not classify owner capital injection as revenue.

Do not classify withdrawal/distribution as operating expense unless explicitly modeled.

Do not count both sale and payment transaction as revenue twice.

## Extrato Rules

Extrato is account movement.

It should reflect actual financial account movement.

Important:

- Movement date
- Amount
- Direction
- Account
- Balance after
- Reconciliation status
- Source transaction/sale/payment when available
- Canceled/reversed movement handling

Do not use extrato as generic list of all expected money.

Do not show pending receivables as if they were account movements.

## Reconciliation Rules

Reconciliation changes financial state.

When reconciling:

- Validate transaction is eligible
- Avoid duplicate reconciliation
- Create/link account movement correctly
- Use correct movement date
- Update status consistently
- Preserve auditability
- Do not lose original transaction reference
- Do not overwrite historical balance incorrectly

When reversing/canceling:

- Preserve original record when possible
- Create reversal or mark canceled according to existing model
- Do not silently delete financial history

## Financial Queries

Financial queries must be precise.

Check for:

- duplicated joins
- split payments multiplying sale totals
- canceled rows
- pending vs reconciled status
- date range inclusivity
- timezone boundaries
- null values
- owner/equity movements
- manual movements
- reversed/canceled movements
- revenue vs cashflow intent

A query returning plausible numbers is not enough.

It must return the correct numbers for the correct business question.

## Date Filters

Date filters must be real, not prepared placeholders.

If the user requests date filtering, implement the actual selector/filter.

Do not just prepare the structure.

Financial date filters must clarify which date is being filtered:

- sale date
- payment date
- due date
- reconciliation date
- movement date
- created date

Do not mix these silently.

## Marketing ROI

Marketing ROI must not be fake.

When calculating ROI:

- Campaign cost must be real
- Sales attribution must be clear
- Revenue/profit basis must be stated
- Leads must preserve campaign origin
- Pending sales should not be treated as final without clear labeling

Do not report ROI as precise if attribution is weak or missing.

## ORION Financial Interpretation

ORION must not invent numbers.

ORION can interpret, recommend and explain, but financial values must come from deterministic queries/engines.

ORION must distinguish:

- Real cash
- Pending receivables
- Revenue
- Profit
- Margin
- DRE result
- Cashflow
- Stock value
- Marketing spend
- Campaign return
- Risk

ORION should be critical and practical.

Bad ORION output:

- Generic advice
- Repeated recommendations
- Numbers without source
- Mixing projected and real cash
- Treating every sale as received
- Treating sold stock as available

Good ORION output:

- "Caixa real reconciliado está em X"
- "Há Y em recebíveis pendentes"
- "Essa venda melhora receita, mas ainda não virou caixa"
- "Esse item parado impacta liquidez"
- "Essa campanha consumiu X e gerou Y leads, mas ainda não há venda atribuída suficiente"

## UI Display Rules for Finance

Financial UI must be explicit.

Avoid ambiguous labels like:

- Total
- Valor
- Saldo
- Resultado
- Recebido

Unless context makes the meaning obvious.

Prefer:

- Total pago pelo cliente
- Valor líquido esperado
- Caixa real reconciliado
- Recebíveis pendentes
- Receita da venda
- Lucro estimado
- Lucro confirmado
- Custo do item
- Custo dos brindes
- Frete
- Outros custos
- Desconto aplicado
- Taxa repassada ao cliente
- Taxa absorvida pela Nobretech

The user should never need to guess what a number means.

## Migration Safety for Finance

Financial migrations are high risk.

Before creating or modifying finance schema:

1. Inspect existing tables
2. Understand historical data
3. Preserve auditability
4. Avoid destructive changes
5. Avoid cascade delete on financial history
6. Prefer additive fields
7. Backfill carefully when needed
8. Keep old records readable
9. Validate with transaction/dry-run if possible
10. Document business meaning

Never drop or rewrite financial history casually.

## Validation Checklist

For any financial change, validate:

- Single payment sale
- Split payment sale
- Card installment sale
- D+1 receivable
- Pix/cash immediate flow if applicable
- Trade-in credit
- Discount
- Freight with decimal comma
- Other costs with decimal comma
- Gift/brinde cost
- Pending receivable
- Reconciled movement
- Canceled transaction
- DRE no duplicate counting
- Real cash balance unchanged unless expected
- ORION interpretation if affected

If you cannot validate all, report what was and was not validated.

## Final Response Format

When finishing finance work, report:

- Files changed
- Financial rule affected
- Source of truth used
- What changed
- What was preserved
- Validation performed
- Known risk or limitation
- Manual test steps

Do not oversell.

Do not say "everything is perfect."

Financial uncertainty must be stated clearly.