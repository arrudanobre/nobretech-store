export interface Company {
  id: string
  name: string
  slug: string
  logo_url?: string
  settings: Record<string, unknown>
  plan: 'solo' | 'starter' | 'pro'
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  company_id: string
  full_name?: string
  role: 'owner' | 'manager' | 'operator'
  avatar_url?: string
  created_at: string
}

export interface ProductCatalog {
  id: string
  category: 'iphone' | 'ipad' | 'applewatch' | 'airpods' | 'macbook' | 'garmin'
  brand: string
  model: string
  variant?: string
  storage?: string
  color?: string
  color_hex?: string
  year?: number
  specs: Record<string, unknown>
  created_at: string
}

export type InventoryStatus =
  | 'in_stock'
  | 'sold'
  | 'returned'
  | 'under_repair'
  | 'trade_in_received'

export type GradeType = 'A+' | 'A' | 'A-' | 'B+' | 'B'

export interface Inventory {
  id: string
  company_id: string
  catalog_id?: string
  imei?: string
  serial_number?: string
  imei2?: string
  grade?: GradeType
  condition_notes?: string
  purchase_price: number
  purchase_date: string
  supplier_id?: string
  suggested_price?: number
  status: InventoryStatus
  checklist_id?: string
  photos?: string[]
  ios_version?: string
  battery_health?: number
  notes?: string
  created_at: string
  updated_at: string
  catalog?: ProductCatalog
  sale?: Sale
  days_in_stock?: number
}

export type ChecklistStatus = 'ok' | 'fail' | 'na'

export interface ChecklistItem {
  id: string
  label: string
  status: ChecklistStatus
  note?: string
}

export interface Checklist {
  id: string
  company_id?: string
  inventory_id?: string
  device_type: string
  items: Record<string, unknown>[]
  completed_at?: string
  completed_by?: string
  pdf_url?: string
  created_at: string
}

export interface Customer {
  id: string
  company_id?: string
  full_name: string
  cpf?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  created_at: string
}

export interface Supplier {
  id: string
  company_id?: string
  name: string
  contact?: string
  phone?: string
  email?: string
  city?: string
  notes?: string
  rating?: number
  created_at: string
}

export interface Sale {
  id: string
  company_id?: string
  inventory_id: string
  customer_id?: string
  sale_price: number
  payment_method: string
  card_fee_pct?: number
  net_amount?: number
  has_trade_in?: boolean
  trade_in_id?: string
  warranty_months?: number
  warranty_start?: string
  warranty_end?: string
  warranty_pdf_url?: string
  sale_date: string
  notes?: string
  created_at: string
  inventory?: Inventory
  customer?: Customer
}

export interface TradeIn {
  id: string
  company_id?: string
  catalog_id?: string
  imei?: string
  serial_number?: string
  grade?: string
  condition_notes?: string
  trade_in_value: number
  checklist_data?: Record<string, unknown>
  photos?: string[]
  status: 'received' | 'added_to_stock' | 'scrapped'
  linked_inventory_id?: string
  notes?: string
  received_at: string
}

export interface Warranty {
  id: string
  company_id?: string
  sale_id?: string
  inventory_id?: string
  customer_id?: string
  start_date: string
  end_date: string
  status: 'active' | 'expiring_soon' | 'expired' | 'voided'
  pdf_url?: string
  notes?: string
  sale?: Sale
  inventory?: Inventory
  customer?: Customer
  days_remaining?: number
}

export type ProblemType =
  | 'return'
  | 'warranty_claim'
  | 'complaint'
  | 'repair'

export type ProblemStatusType =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed'

export type ProblemPriority = 'low' | 'medium' | 'high' | 'critical'

export interface Problem {
  id: string
  company_id?: string
  sale_id?: string
  inventory_id?: string
  customer_id?: string
  type: ProblemType
  description: string
  reported_date: string
  cause?: string
  action_plan?: string
  action_deadline?: string
  resolved_date?: string
  resolution_notes?: string
  tags?: string[]
  status: ProblemStatusType
  priority: ProblemPriority
  refund_amount?: number
  repair_cost?: number
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  company_id?: string
  supplier_id?: string
  catalog_id?: string
  device_desc: string
  grade?: string
  quoted_price: number
  quantity?: number
  valid_until?: string
  notes?: string
  ai_analysis?: string
  ai_score?: number
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  quoted_at: string
  supplier?: Supplier
}

export interface FinancialSettings {
  id: string
  company_id?: string
  default_margin_pct?: number
  debit_fee_pct?: number
  credit_1x_fee_pct?: number
  credit_2x_fee_pct?: number
  credit_3x_fee_pct?: number
  credit_4x_fee_pct?: number
  credit_5x_fee_pct?: number
  credit_6x_fee_pct?: number
  credit_7x_fee_pct?: number
  credit_8x_fee_pct?: number
  credit_9x_fee_pct?: number
  credit_10x_fee_pct?: number
  credit_11x_fee_pct?: number
  credit_12x_fee_pct?: number
  pix_fee_pct?: number
  cash_discount_pct?: number
  default_warranty_months?: number
  updated_at: string
}

// ── Dropdown option helper ───────────────────────────────────

export interface SelectOption {
  label: string
  value: string
}

export interface DashboardKPIs {
  total_invested: number
  total_sold_month: number
  total_sold_year: number
  net_profit_month: number
  net_profit_year: number
  avg_margin: number
  stock_count: number
  stock_value: number
  warranties_expiring: number
  open_problems: number
}
