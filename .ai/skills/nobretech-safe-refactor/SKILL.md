---
name: nobretech-safe-refactor
description: Safely modify, fix and refactor the Nobretech ERP codebase with minimal risk, preserving behavior, business rules, routes, API contracts, database assumptions and production stability. Use this skill whenever editing existing code, fixing bugs, refactoring files, changing APIs, touching migrations, adjusting queries or improving architecture.
license: Complete terms in LICENSE.txt
---

# Nobretech Safe Refactor

You are working on the Nobretech Store ERP/CRM codebase.

This skill applies whenever modifying existing code, fixing bugs, refactoring files, changing APIs, touching migrations, adjusting queries, improving architecture, reorganizing components, changing helpers or editing business-critical flows.

Your job is to improve the system without creating new damage.

A refactor that breaks business behavior is not a refactor. It is a regression.

## Core Principle

Make the smallest correct change that solves the real problem.

Do not rewrite large files just because they are ugly.

Do not replace working logic without understanding it.

Do not simplify away real business rules.

Do not introduce broad architectural changes unless explicitly requested.

The goal is controlled progress, not heroic rewriting.

## Default Strategy

Before editing code:

1. Understand the bug or improvement requested.
2. Locate the minimum set of files involved.
3. Identify the source of truth for the behavior.
4. Check existing helpers, types, APIs and patterns.
5. Preserve current behavior outside the requested change.
6. Make the smallest safe modification.
7. Validate the affected flow.

If the task is unclear, infer carefully from the existing code and business rules. Do not invent a new flow.

## Risk Levels

Classify changes mentally before editing.

### Low Risk

Examples:

- Visual spacing
- Text label adjustment
- Icon replacement
- Small Tailwind refinement
- Empty state copy
- Non-financial UI organization

Still preserve existing behavior.

### Medium Risk

Examples:

- Form behavior
- Filters
- Tables
- Pagination
- Status display
- API payload shape
- Component extraction
- Search behavior

Validate carefully.

### High Risk

Examples:

- Payments
- Sales totals
- Profit/margin
- Trade-in
- Stock availability
- Financial balance
- DRE
- Reconciliation
- Transactions
- `sale_payments`
- Migrations
- ORION data interpretation
- Customer portal warranty/receipt data

High-risk changes require extra caution, explicit validation and clear final reporting.

## Non-Negotiable Rules

Never:

- Change financial meaning casually
- Hardcode business values
- Create fake data in production flows
- Delete edge cases without proof they are invalid
- Rename database columns casually
- Drop data casually
- Replace a deterministic calculation with frontend-only logic
- Move business-critical logic into a visual component unless already there and preserved
- Treat pending money as real cash
- Treat unavailable stock as sellable
- Count payments twice
- Break customer portal safety
- Break authentication/authorization checks
- Remove validation because it is inconvenient
- Suppress TypeScript errors with `any` unless absolutely unavoidable and explained
- Hide errors instead of fixing them
- Add dependencies without strong reason

## Scope Control

Stay inside the requested scope.

If the user asks to fix freight decimal input, do not redesign the entire sales page.

If the user asks to improve a button, do not rewrite the data model.

If the user asks to fix a query, do not restyle unrelated UI.

If the user asks for frontend, do not silently change backend behavior.

If the user asks for backend, explain any frontend impact.

Adjacent cleanup is allowed only when it directly reduces risk for the requested change.

## File Editing Rules

Before changing a file:

- Read the surrounding code.
- Understand imports and exports.
- Check whether the file is server or client.
- Check existing naming conventions.
- Check existing helper functions.
- Check how the file is used elsewhere.

When editing:

- Prefer targeted patches.
- Keep diffs small.
- Preserve formatting style.
- Avoid moving large blocks unnecessarily.
- Avoid unrelated cleanup.
- Avoid changing public interfaces unless required.
- Avoid deleting comments that explain business rules.
- Keep meaningful names.

After editing:

- Check for unused imports.
- Check for broken types.
- Check for missing dependencies in hooks.
- Check for client/server boundary issues.
- Check for accidental behavior changes.

## TypeScript Rules

Use TypeScript to reduce risk.

Prefer:

- Explicit types for business-critical data
- Existing project types
- Narrow types where possible
- Type guards when handling uncertain data
- Clear return types for helpers that affect money/status

Avoid:

- `any` as a shortcut
- broad `unknown` without narrowing
- unsafe casts
- optional chaining that hides missing required data
- ignoring nullable states in financial logic
- changing types to make errors disappear

If a type error reveals a real mismatch, fix the mismatch, not the compiler.

## React and Next.js Rules

Respect Next.js App Router boundaries.

Rules:

- Do not add `"use client"` to large files casually.
- Do not move server-only logic into client components.
- Do not access database or secrets from client components.
- Do not pass huge objects to client components unnecessarily.
- Keep forms predictable.
- Avoid hydration mismatches.
- Avoid effects that duplicate server work.
- Avoid race conditions in async UI.
- Use stable keys in lists.
- Keep loading, empty and error states honest.

Client components are for interaction.

Server components/routes/actions are for data and secure logic.

## API Rules

When changing API routes or server actions:

- Preserve response shape unless change is required.
- Preserve authentication and authorization.
- Validate inputs.
- Return useful errors.
- Avoid exposing sensitive data.
- Keep database operations deterministic.
- Avoid swallowing exceptions silently.
- Avoid leaking internal stack traces to the user.
- Make frontend callers compatible with any response changes.

Do not weaken security to make a UI work.

## Database Rules

Database changes are high risk.

Before writing a migration:

1. Check existing schema and naming.
2. Check real data assumptions.
3. Prefer additive changes.
4. Avoid destructive changes.
5. Avoid cascade deletes unless explicitly justified.
6. Preserve historical financial data.
7. Use safe defaults.
8. Consider backfill needs.
9. Make migration idempotent when practical.
10. Validate with transaction/dry-run when possible.

Do not create a migration just because frontend code is inconvenient.

Do not use schema changes to hide poor application logic.

## Query Rules

Queries must be precise.

Check:

- status filters
- canceled/deleted rows
- pending vs reconciled
- sold vs available stock
- duplicated joins
- date ranges
- timezone behavior
- joins that multiply rows
- null handling
- owner/equity movements
- sale_payments vs transactions duplication

A query that returns data is not necessarily correct.

A query is correct only if it matches the business meaning.

## Financial Refactor Rules

Financial code requires extreme caution.

Before changing financial behavior, identify:

- Source table
- Source of truth
- Whether value is real or projected
- Whether value is gross or net
- Whether value is sale-level or payment-level
- Whether value is pending or reconciled
- Whether canceled records are excluded
- Whether split payments are counted once
- Whether trade-in is cash or offset
- Whether card fee is company cost or customer-paid

Do not merge financial values with different meanings.

Do not label ambiguous totals as "total".

Do not calculate profit from incomplete inputs.

## Inventory Refactor Rules

Inventory is per-unit.

Do not assume quantity.

When checking availability, consider statuses.

Do not include:

- sold
- returned
- under repair
- unavailable
- canceled records

unless explicitly requested.

Use structured fields before names.

Do not classify device/accessory purely by name when better data exists.

## UI Refactor Rules

A UI refactor must improve usability without damaging behavior.

When changing UI:

- Preserve all required fields.
- Preserve validation.
- Preserve disabled states.
- Preserve loading/error states.
- Preserve selected values.
- Preserve calculations.
- Preserve submit payload.
- Preserve accessibility.
- Preserve responsive behavior or improve it.

Do not remove fields because the screen looks cleaner.

Hide or collapse secondary information only when it remains accessible.

## Bug Fix Rules

Fix the cause, not only the symptom.

For every bug, identify:

- What the user expected
- What happened instead
- Where the incorrect behavior starts
- Whether the bug is parsing, state, API, database, query, display or business rule
- Whether similar fields share the same issue

Example:

If freight input parses comma incorrectly, check other cost inputs that use the same parser.

Do not patch only one field if the root helper is shared and wrong.

## Currency and Locale Rules

Brazilian currency handling matters.

Inputs may use comma or dot.

Correct examples:

- `85,18` means `85.18`
- `85.18` means `85.18`
- `1.234,56` means `1234.56`
- `1,234.56` should be handled cautiously based on parser rules
- cents must not become thousands

Never parse currency using naive `Number(value.replace(',', '.'))` if thousands separators may exist.

Use or create a safe helper and reuse it.

## Validation Rules

Run the strongest validation practical for the change.

Common commands may include:

- `npm run build`
- `npm run lint`
- `npm run typecheck`
- focused tests if available
- manual route test
- query validation
- migration dry-run

If global lint/build has existing unrelated failures, report that honestly and run focused validation where possible.

Do not claim full validation if it was not performed.

## Final Response Requirements

At the end of work, report:

- Files changed
- What changed
- Why it was needed
- Business behavior preserved
- Validation performed
- Known risks or limitations
- Manual test steps

Be direct.

Do not oversell.

Do not say "everything is perfect".

If something was not tested, say so.