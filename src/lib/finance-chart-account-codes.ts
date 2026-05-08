export type ChartAccountCodeSource = {
  id?: string | null
  code?: string | null
  parent_code?: string | null
  level?: number | string | null
}

const CHART_CODE_PATTERN = /^(\d+)(?:\.(\d+))?$/
const CHART_CODE_PARTS_PATTERN = /^\d+(?:\.\d+)*$/

export function normalizeChartAccountCode(code: unknown) {
  return String(code || "").trim()
}

export function parseChartAccountCode(code: unknown) {
  const normalized = normalizeChartAccountCode(code)
  const match = normalized.match(CHART_CODE_PATTERN)
  if (!match) return null

  return {
    code: normalized,
    main: Number(match[1]),
    mainCode: match[1],
    child: match[2] ? Number(match[2]) : null,
  }
}

export function getChartAccountCodeParts(code: unknown) {
  const normalized = normalizeChartAccountCode(code)
  if (!CHART_CODE_PARTS_PATTERN.test(normalized)) return []
  return normalized.split(".").map((part) => Number(part))
}

export function compareChartAccountCodes(left: unknown, right: unknown) {
  const leftParts = getChartAccountCodeParts(left)
  const rightParts = getChartAccountCodeParts(right)

  if (leftParts.length === 0 && rightParts.length === 0) {
    return normalizeChartAccountCode(left).localeCompare(normalizeChartAccountCode(right), "pt-BR", { numeric: true })
  }
  if (leftParts.length === 0) return 1
  if (rightParts.length === 0) return -1

  const maxLength = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index]
    const rightValue = rightParts[index]
    if (leftValue === undefined) return -1
    if (rightValue === undefined) return 1
    if (leftValue !== rightValue) return leftValue - rightValue
  }

  return 0
}

export function getChartAccountParentCode(code: unknown) {
  const normalized = normalizeChartAccountCode(code)
  const parts = normalized.split(".").filter(Boolean)
  if (parts.length <= 1) return ""
  return parts.slice(0, -1).join(".")
}

export function sortOrderFromChartCode(code: unknown) {
  const parts = getChartAccountCodeParts(code)
  if (parts.length === 0) return "0"

  return String(parts.reduce((total, part) => (total * 1000) + part, 0))
}

function isSameAccount(account: ChartAccountCodeSource, excludeId?: string | null) {
  return Boolean(excludeId && account.id && account.id === excludeId)
}

function hasCode(accounts: ChartAccountCodeSource[], code: string, excludeId?: string | null) {
  return accounts.some((account) => !isSameAccount(account, excludeId) && normalizeChartAccountCode(account.code) === code)
}

export function getNextMainChartAccountCode(accounts: ChartAccountCodeSource[], excludeId?: string | null) {
  const usedMainNumbers = new Set(accounts
    .filter((account) => !isSameAccount(account, excludeId))
    .map((account) => getChartAccountCodeParts(account.code)[0] || 0)
    .filter((value) => value > 0))

  let next = 1
  while (usedMainNumbers.has(next)) next += 1
  while (hasCode(accounts, String(next), excludeId)) next += 1
  return String(next)
}

export function getNextChildChartAccountCode(
  accounts: ChartAccountCodeSource[],
  parentCode: string,
  excludeId?: string | null
) {
  const parent = normalizeChartAccountCode(parentCode)
  const usedChildNumbers = new Set(accounts
    .filter((account) => !isSameAccount(account, excludeId))
    .filter((account) => getChartAccountParentCode(account.code) === parent)
    .map((account) => getChartAccountCodeParts(account.code).at(-1) || 0))

  let next = 1
  while (usedChildNumbers.has(next)) next += 1
  let candidate = `${parent}.${String(next).padStart(2, "0")}`
  while (hasCode(accounts, candidate, excludeId)) {
    next += 1
    candidate = `${parent}.${String(next).padStart(2, "0")}`
  }
  return candidate
}

export function inferParentCodeFromChartCode(code: unknown) {
  return getChartAccountParentCode(code)
}

export function getNextChartAccountCode(
  accounts: ChartAccountCodeSource[],
  parentCode?: string | null,
  excludeId?: string | null
) {
  const parent = normalizeChartAccountCode(parentCode)
  if (parent) return getNextChildChartAccountCode(accounts, parent, excludeId)
  return getNextMainChartAccountCode(accounts, excludeId)
}
