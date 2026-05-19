export const USER_ROLES = ["owner", "manager", "operator", "reseller"] as const

export type UserRole = (typeof USER_ROLES)[number]

export type PermissionKey =
  | "settings.view"
  | "settings.edit"
  | "users.manage"
  | "finance.view"
  | "finance.edit"
  | "finance.dre"
  | "finance.tax_settings"
  | "inventory.delete"
  | "inventory.edit_cost"
  | "sales.cancel"
  | "sales.edit_sensitive"
  | "sensitive.delete"
  | "resellers.manage"

export const roleLabels: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  operator: "Operator",
  reseller: "Revendedor",
}

export const roleDescriptions: Record<UserRole, string> = {
  owner: "Acesso total, configurações, equipe, financeiro, DRE e ações críticas.",
  manager: "Opera vendas, estoque, clientes, garantias e problemas sem acesso ao financeiro.",
  operator: "Vende e consulta estoque, clientes e garantias sem custos, DRE ou taxas.",
  reseller: "Acesso restrito ao Portal de Revendedores. Sem acesso ao ERP.",
}

export const rolePermissions: Record<UserRole, PermissionKey[]> = {
  owner: [
    "settings.view",
    "settings.edit",
    "users.manage",
    "finance.view",
    "finance.edit",
    "finance.dre",
    "finance.tax_settings",
    "inventory.delete",
    "inventory.edit_cost",
    "sales.cancel",
    "sales.edit_sensitive",
    "sensitive.delete",
    "resellers.manage",
  ],
  manager: [
    "settings.view",
    "resellers.manage",
  ],
  operator: [
    "settings.view",
  ],
  reseller: [],
}

export function isResellerRole(role?: string | null): boolean {
  return normalizeRole(role) === "reseller"
}

export function canManageResellers(role: string | null | undefined) {
  return canAccess(role, "resellers.manage")
}

export function normalizeRole(role?: string | null): UserRole {
  return USER_ROLES.includes(role as UserRole) ? (role as UserRole) : "operator"
}

export function canAccess(role: string | null | undefined, permission: PermissionKey) {
  return rolePermissions[normalizeRole(role)].includes(permission)
}

export function canManageUsers(role: string | null | undefined) {
  return canAccess(role, "users.manage")
}

export function canEditFinance(role: string | null | undefined) {
  return canAccess(role, "finance.edit")
}

export function canDeleteSensitiveRecords(role: string | null | undefined) {
  return canAccess(role, "sensitive.delete")
}
