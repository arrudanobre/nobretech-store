export type FinancialTraceabilityKind =
  | "profit_withdrawals"
  | "capital_returns"
  | "contributions"
  | "ambiguous"
  | "owner_movements"
  | "cash_origin"
  | "realized_profit"
  | "reinvestment_audit"
  | "generic"
  | null

function tokenize(value: string) {
  const normalized = value.toLowerCase().normalize("NFD")
  const chars = Array.from(normalized).map((char) => {
    const code = char.charCodeAt(0)
    if (code >= 768 && code <= 879) return ""
    if (char >= "a" && char <= "z") return char
    if (char >= "0" && char <= "9") return char
    return " "
  })
  return new Set(chars.join("").split(" ").filter(Boolean))
}

function hasAny(tokens: Set<string>, values: string[]) {
  return values.some((value) => tokens.has(value))
}

const traceabilityActionTokens = [
  "liste",
  "listar",
  "mostre",
  "mostrar",
  "detalhe",
  "detalhar",
  "estratifique",
  "estratificar",
  "extraia",
  "extrair",
  "abra",
  "abrir",
  "quebre",
  "quebrar",
  "explique",
  "explicar",
  "quais",
  "qual",
  "composicao",
  "compoe",
  "origem",
  "onde",
  "veio",
  "numero",
  "valor",
  "calculo",
  "calculos",
  "movimentos",
  "lancamentos",
]

const financialSubjectTokens = [
  "caixa",
  "lucro",
  "retirada",
  "retiradas",
  "saque",
  "saques",
  "aporte",
  "aportes",
  "devolucao",
  "devolucoes",
  "reembolso",
  "reembolsos",
  "retorno",
  "reinvestimento",
  "reinvestir",
  "recompra",
  "estoque",
  "dono",
  "proprietario",
  "owner",
  "movimentos",
  "lancamentos",
]

export function isFinancialTraceabilityRequest(question: string) {
  const tokens = tokenize(question)
  return hasAny(tokens, traceabilityActionTokens) && hasAny(tokens, financialSubjectTokens)
}

export function isFinancialWithdrawalDecisionRequest(question: string) {
  const tokens = tokenize(question)
  return hasAny(tokens, ["sacar", "saque", "saques", "retirar", "retirada", "retiradas", "pagar", "pago"])
    && hasAny(tokens, ["posso", "devo", "quanto", "hoje", "agora", "lucro", "seguro", "segura", "comprometer"])
}

export function isFinancialReinvestmentDecisionRequest(question: string) {
  const tokens = tokenize(question)
  return hasAny(tokens, ["reinvestir", "reinvestimento", "recomprar", "recompra", "comprar"])
    && hasAny(tokens, ["posso", "devo", "quanto", "seguro", "segura", "caixa", "estoque", "agora", "hoje"])
}

export function isFinancialDecisionRequest(question: string) {
  return isFinancialWithdrawalDecisionRequest(question) || isFinancialReinvestmentDecisionRequest(question)
}

export function selectFinancialTraceabilityKind(question: string): FinancialTraceabilityKind {
  const tokens = tokenize(question)
  if (!isFinancialTraceabilityRequest(question)) return null
  if (hasAny(tokens, ["ambiguo", "ambiguos", "revisao"])) return "ambiguous"
  if (hasAny(tokens, ["reinvestir", "reinvestimento", "recompra", "recomprar"])) return "reinvestment_audit"
  if (hasAny(tokens, ["caixa"]) && hasAny(tokens, ["origem", "onde", "veio", "composicao", "compoe"])) return "cash_origin"
  if (hasAny(tokens, ["devolucao", "devolucoes", "reembolso", "reembolsos", "retorno"])) return "capital_returns"
  if (hasAny(tokens, ["aporte", "aportes", "contribuicao", "contribuicoes"])) return "contributions"
  if (hasAny(tokens, ["retirada", "retiradas", "saque", "saques"])) return "profit_withdrawals"
  if (hasAny(tokens, ["lucro"]) && hasAny(tokens, ["realizado", "periodo", "valor", "numero", "composicao", "compoe", "abra"])) return "realized_profit"
  if (hasAny(tokens, ["dono", "proprietario", "owner", "movimentos", "lancamentos"])) return "owner_movements"
  return "generic"
}
