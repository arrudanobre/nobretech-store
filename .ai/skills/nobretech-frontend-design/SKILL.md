---
name: nobretech-frontend-design
description: Design and implement premium, Apple-like, production-grade frontend interfaces for the Nobretech ERP, CRM, ORION AI and customer transparency portal, preserving existing business logic and avoiding generic AI layouts. Use this skill whenever modifying UI, UX, pages, components, dashboards, forms, tables, modals, sales flows, finance screens, inventory screens, CRM screens, ORION screens or customer-facing portal interfaces.
license: Complete terms in LICENSE.txt
---

# Nobretech Frontend Design

You are working on the Nobretech Store system.

This skill applies to both frontend design and frontend implementation. Use it whenever modifying visual interface, user experience, layout, pages, components, forms, tables, modals, dashboards, sales flows, finance screens, CRM screens, inventory screens, ORION AI screens or the customer transparency portal.

Nobretech is not a generic SaaS dashboard.

Nobretech is a premium Apple-focused retail business with its own ERP, CRM, finance module, sales flow, inventory control, trade-in logic, warranty flows, customer transparency portal, marketing/lead management and ORION AI executive assistant.

Your job is not to create a pretty generic screen.

Your job is to create interfaces that feel like they belong to Nobretech: premium, dark, precise, commercial, trustworthy, operationally clear and financially serious.

## Core Principle

Frontend work in Nobretech must improve clarity, trust and operational speed.

A screen is only good if the user can understand faster, decide better and make fewer mistakes.

Decoration is not the goal.

Premium clarity is the goal.

## Visual Identity

Nobretech interfaces should feel:

- Premium
- Apple-like
- Dark
- Minimal but not empty
- Executive
- Commercial
- Trustworthy
- Operationally clear
- Financially serious
- Human and polished

The system should feel like a serious Apple-oriented business operation, not a startup template.

## What To Avoid

Avoid:

- Generic admin dashboard style
- Default SaaS templates
- Purple AI gradients
- Random neon/cyberpunk effects
- Excessive glassmorphism
- Excessive gradients
- Playful/toy-like UI
- Pastel dashboard aesthetics
- Brutalist/raw design
- Retro-futuristic layouts
- Overly colorful cards
- Badge pollution
- Chart pollution
- Crowded interfaces
- Duplicate controls
- Unnecessary animations
- Visual effects that do not improve clarity
- Cookie-cutter Tailwind layouts
- Layouts that only look good in screenshots but are bad to use

Do not make Nobretech look like a generic AI-generated interface.

## Before Coding

Before editing any frontend code, understand the screen.

Think through:

1. What does the user need to decide here?
2. What is the primary action?
3. What information must be visible immediately?
4. What information can be secondary, collapsed or moved to details?
5. What existing business logic must be preserved?
6. What risk exists if the UI is misunderstood?
7. What existing components, helpers or patterns can be reused?
8. What would make this screen easier to operate under pressure?

Do not start by adding visual elements.

Start by removing confusion.

## Design Hierarchy

Every screen must have clear hierarchy.

Use:

- One clear page title
- One obvious primary action
- Clear grouping of related information
- Calm secondary actions
- Strong readability for financial values
- Status values that are easy to scan
- Dangerous actions visually separated
- Summaries where they reduce confusion
- Details hidden until needed

Avoid screens where everything has equal visual weight.

If everything is highlighted, nothing is highlighted.

## Layout Rules

Preferred layout patterns:

- Deep dark page background
- Slightly elevated dark cards
- Soft neutral borders
- Restrained shadows
- Clear section spacing
- Guided forms divided into business blocks
- Compact but readable tables
- Sticky summaries when they reduce confusion
- Detail drawers or row expansion for secondary data
- Responsive mobile-first alternatives
- Empty states that explain the next action

Avoid:

- Random cards just to fill space
- Multiple button rows competing for attention
- Same action appearing in different places
- Same decision represented by different controls
- Long ungrouped forms
- Tables with cramped action columns
- Overloaded modals
- Excessive icons
- Badges on every field
- Screens where users must guess what is editable and what is summary

## Typography

Typography must feel premium and readable.

Rules:

- Use the existing project typography unless there is a strong reason to change it
- Do not randomly introduce new font dependencies
- Page titles should be confident, not huge
- Body text must be easy to read
- Labels should be quiet but legible
- Financial values should be easy to scan
- Important numbers need visual strength
- Avoid tiny gray text with poor contrast
- Avoid unnecessary uppercase
- Avoid generic AI-looking text hierarchy

Premium cannot mean unreadable.

## Color Rules

Use a restrained color system.

Base:

- Deep dark backgrounds
- Dark elevated surfaces
- Neutral borders
- Near-white primary text
- Muted gray secondary text

Semantic colors:

- Green: profit, received, success, positive cash impact
- Red: loss, overdue, cancellation, destructive action
- Amber/yellow: warning, pending risk, attention
- Blue/cyan: information, links, ORION/AI context, operational intelligence

Rules:

- Do not make screens rainbow-colored
- Do not assign colors randomly
- Do not use color only as decoration
- Color must clarify meaning
- Status colors must remain consistent across the system
- Financial colors must not mislead the user

## Motion Rules

Motion should be subtle and premium.

Use motion only when it improves experience:

- Page entrance
- Card reveal
- Step transitions
- Drawer/modal entrance
- Hover feedback
- Loading states
- ORION response transitions

Avoid:

- Bouncy effects
- Playful animations
- Slow transitions
- Motion that delays operational work
- Effects that distract from financial or sales decisions

Motion should make the system feel alive, not childish.

## Component Rules

When creating or editing components:

- Reuse existing components when possible
- Keep props typed
- Avoid unnecessary abstraction
- Avoid large generic components that become hard to maintain
- Keep business-specific names when appropriate
- Avoid hardcoded demo values
- Avoid duplicated formatting logic
- Use existing helpers for money, dates, status and masks when available
- Keep server/client boundaries correct in Next.js
- Avoid creating a new component library inside one screen
- Do not introduce dependencies unless clearly justified

A component should make the system easier to maintain, not just make one file look shorter.

## Tailwind Rules

Use Tailwind with discipline.

Prefer:

- Consistent spacing
- Consistent radius
- Consistent border colors
- Consistent text hierarchy
- Grouped class patterns
- Readable class organization
- Shared visual language across screens

Avoid:

- Huge unreadable class strings when extraction would help
- Random one-off colors
- Arbitrary values everywhere
- Conflicting responsive classes
- Copy-paste styling without purpose
- Styling that breaks dark mode consistency
- Styling that works only for one screen size

## Business Logic Protection

Frontend must not invent business logic.

Never hardcode financial calculations that should come from backend, database, engines or existing helpers.

Never change the meaning of:

- Sale total
- Customer total
- Nobretech receivable
- Profit
- Margin
- Trade-in credit
- Freight
- Other costs
- Card fees
- Installments
- Receivables
- Reconciliation status
- Stock availability
- Warranty period
- DRE classification
- Payment status
- Product type
- Accessory type
- Device type

If the screen displays money, profit, stock, receivables or payment values, preserve the existing deterministic source of truth.

AI-generated explanations may explain values, but must not invent calculations.

## Sales Flow Rules

Sales screens must be extremely clear.

The user must understand:

- What product is being sold
- What accessories are included
- What is a gift
- What is charged
- Payment method
- Installment count
- Value per installment
- Total paid by customer
- What Nobretech receives
- Due date or D+1 behavior when relevant
- Trade-in credit
- Freight
- Other costs
- Warranty
- Profit or margin impact
- Reservation or immediate sale status

Avoid duplicate payment selectors.

Avoid showing payment options in two competing places.

If a payment option is selectable in one area, any repeated display elsewhere must be read-only summary.

Installment options must show:

- Number of installments
- Value per installment
- Total paid by customer
- Fees if applicable
- What Nobretech receives, when relevant

The user should never wonder which payment option is active.

## Finance UI Rules

Finance screens must prioritize accuracy, traceability and separation between real and projected money.

Important finance screens should clearly separate:

- Real reconciled cash balance
- Pending receivables
- Paid/received values
- Overdue values
- Due dates
- Reconciliation status
- Source of movement
- Links to related sale/payment when available

Never mix projected money with real cash without clear labeling.

Never make financial cards vague.

Avoid "estimated" language unless the value is actually estimated.

If money is reconciled, pending, canceled or projected, the UI must make that obvious.

## Inventory UI Rules

Inventory screens must distinguish clearly:

- Available
- Sold
- Reserved
- Returned
- Under repair
- Trade-in received
- Pending
- Active/in stock

Do not treat every inventory row as available.

Do not infer device/accessory purely by name if structured fields exist.

Use structured fields when available:

- product_type
- category
- subcategory
- IMEI/serial
- variation data
- stock status

Product type display must not be guessed from commercial name when reliable fields exist.

## CRM and Marketing UI Rules

CRM screens must help sell, not just store data.

CRM interfaces should make obvious:

- Lead name
- Contact channel
- Product of interest
- Campaign origin
- Lead temperature
- Current status
- Last interaction
- Next action
- Follow-up urgency
- Whether the lead is cold, warm or hot
- Whether the lead needs movement now

Avoid CRM screens that are just passive tables.

The UI should help the user decide who to contact next and what to say.

## ORION AI UI Rules

ORION is not a generic chatbot widget.

ORION is the executive intelligence layer of Nobretech.

The ORION interface should feel:

- Strategic
- Analytical
- Alive
- Executive
- Direct
- Data-driven

ORION must not be trapped in generic cards.

Cards, charts and badges are supporting evidence, not the main answer.

The conversational area must be prominent and feel like an executive command center.

ORION responses should be human, direct, critical and decision-oriented.

Avoid generic AI dashboard aesthetics.

Avoid fixed canned-response feeling.

Avoid UI that makes ORION look like a decorative assistant instead of an operational intelligence layer.

## Customer Transparency Portal Rules

The customer-facing portal must feel premium, trustworthy and simple.

The customer should understand:

- What they bought
- Purchase date
- Warranty status
- Device information
- Included accessories
- Masked IMEI/serial when appropriate
- Receipt download
- Warranty term download
- Traceability information when available
- PIN/token access flow

Avoid exposing sensitive data.

Use partial/masked previous owner data only when supported by the business rule.

The portal should feel like proof of professionalism, not an internal admin page.

## Form Design

Forms must be guided and calm.

Use sections such as:

- Cliente
- Produto
- Pagamento
- Garantia
- Trade-in
- Custos adicionais
- Observações
- Resumo

Each section must have a clear purpose.

Use masks for:

- BRL currency
- Phone
- CPF when applicable
- Dates
- Percentages

Avoid:

- Long ungrouped forms
- Fields with equal visual importance
- Helper text that explains the obvious
- Inputs that hide the real value being saved
- Currency bugs with comma/decimal conversion
- Ambiguous optional fields

Forms should prevent errors, not merely collect data.

## Table Design

Tables should be readable, compact and operational.

Rules:

- Important status visible at a glance
- Actions grouped logically
- No cluttered action columns
- No truncation of critical financial values
- Search and filters must be obvious
- Pagination should be stable and clear
- Empty states should guide action
- Row expansion or detail drawer should be used for secondary data
- Mobile layout must not rely on wide tables

A table is not good because it shows everything.

A table is good when it helps the user find and act faster.

## Icons

Icons must clarify, not decorate.

Rules:

- Use consistent icon style
- Avoid random device icons
- Avoid icons that weaken the premium feel
- Avoid icons without labels when meaning is not obvious
- Prefer custom or brand-consistent marks for Nobretech-specific identity
- Do not rely on icons to carry important meaning alone

If an icon does not improve comprehension, remove it.

## Responsiveness

Nobretech is used on desktop and mobile.

Desktop:

- Prioritize operational density without clutter
- Use sticky summaries and side panels when useful
- Use tables where appropriate
- Keep primary actions easy to find

Mobile:

- Prioritize guided flow
- Avoid wide tables
- Use cards, accordions or stacked summaries
- Keep primary action reachable
- Do not simply shrink desktop UI
- Make payment, finance and sales summaries easy to read

Mobile usability cannot be an afterthought.

## Accessibility

Maintain:

- Sufficient contrast
- Keyboard-accessible controls
- Visible focus states
- Clear labels
- Semantic buttons and inputs
- No important information communicated by color alone
- Readable font sizes
- Safe tap targets on mobile

Premium cannot come at the cost of usability.

## Implementation Safety

Use the existing project stack and conventions.

Likely stack:

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- PostgreSQL/Railway backend
- Server-side business logic where appropriate

Rules:

- Do not rewrite entire files unless required
- Prefer small, safe, reviewable changes
- Preserve existing business logic
- Preserve routes and API contracts
- Preserve database assumptions
- Preserve server/client boundaries
- Avoid unnecessary dependencies
- Avoid dead code
- Avoid unused components
- Avoid duplicated helpers
- Avoid fragile parsing
- Avoid fake data in production components
- Avoid changing financial behavior inside UI work

If the requested task is visual, do not secretly change business logic.

If the requested task touches business logic, make that explicit in the final response.

## Handling Existing Bad UI

When improving an existing screen, do not just make it prettier.

Identify what is structurally wrong.

Common problems to fix:

- Too many competing cards
- Duplicate controls
- Bad hierarchy
- Confusing payment selection
- Financial values hard to scan
- Important actions hidden
- Secondary data too loud
- Tables overloaded
- Mobile layout neglected
- Status labels inconsistent
- Icons decorative instead of useful
- Layout not aligned with real workflow

The goal is not a visual facelift.

The goal is better operation.

## Quality Checklist Before Finishing

Before finalizing, verify:

1. Does this look like Nobretech?
2. Is the primary action obvious?
3. Did the UI become easier to understand?
4. Did the UI become easier to operate?
5. Did I preserve business logic?
6. Are financial/product/payment values displayed clearly?
7. Are statuses meaningful and consistent?
8. Did I avoid generic AI aesthetics?
9. Did I avoid unnecessary rewrites?
10. Does it work on mobile?
11. Did I avoid duplicate controls?
12. Did I reduce confusion instead of adding decoration?
13. Did I keep the code maintainable?
14. Would Vinícius understand the screen faster than before?

If the answer is no, improve before delivering.

## Final Response Format

When reporting changes, be concise and specific.

Include:

- Files changed
- What changed
- Why it improves the business workflow
- Any known risk or limitation
- How to test

Do not oversell.

Do not say everything is perfect.

Be honest about remaining issues.