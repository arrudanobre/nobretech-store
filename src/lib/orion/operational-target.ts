export type OperationalTargetSource =
  | "explicit_user_goal"
  | "upcoming_bills"
  | "configured_target"
  | "no_active_target"

export type OperationalTarget = {
  targetAmount: number | null
  source: OperationalTargetSource
  label: string
  explanation: string
}

export type OperationalTargetGap = {
  amount: number | null
  label: string
  tone: "neutral" | "green" | "red"
  explanation: string
}

export type ResolveOperationalTargetInput = {
  explicitUserGoal?: number | string | null
  upcomingBills30d?: number | string | null
  minimumBuffer?: number | string | null
  configuredTarget?: number | string | null
  availableCash?: number | string | null
  realAvailableProfit?: number | string | null
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function positive(value: unknown) {
  return Math.max(0, number(value))
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function resolveOperationalTarget(input: ResolveOperationalTargetInput): {
  target: OperationalTarget
  gap: OperationalTargetGap
} {
  const explicitUserGoal = positive(input.explicitUserGoal)
  const configuredTarget = positive(input.configuredTarget)
  const availableCash = positive(input.availableCash)
  const realAvailableProfit = positive(input.realAvailableProfit)

  if (explicitUserGoal > 0) {
    const gap = roundCurrency(Math.max(0, explicitUserGoal - realAvailableProfit))
    return {
      target: {
        targetAmount: roundCurrency(explicitUserGoal),
        source: "explicit_user_goal",
        label: "Meta operacional",
        explanation: "Meta explícita do contexto operacional atual.",
      },
      gap: {
        amount: gap,
        label: gap > 0 ? "Gap para meta" : "Coberto",
        tone: gap > 0 ? "red" : "green",
        explanation: "Gap calculado contra lucro operacional rastreado, sem usar caixa atual como meta.",
      },
    }
  }

  if (configuredTarget > 0) {
    const gap = roundCurrency(Math.max(0, configuredTarget - availableCash))
    return {
      target: {
        targetAmount: roundCurrency(configuredTarget),
        source: "configured_target",
        label: "Meta operacional configurada",
        explanation: "Meta operacional configurada estruturalmente.",
      },
      gap: {
        amount: gap,
        label: gap > 0 ? "Gap para meta" : "Coberto",
        tone: gap > 0 ? "red" : "green",
        explanation: "Gap calculado contra caixa disponível porque a meta configurada é operacional.",
      },
    }
  }

  return {
    target: {
      targetAmount: null,
      source: "no_active_target",
      label: "Meta operacional",
      explanation: "Sem meta operacional ativa no contexto atual.",
    },
    gap: {
      amount: null,
      label: "Sem meta ativa",
      tone: "neutral",
      explanation: "Sem meta ativa; nenhum gap deve ser calculado ou sinalizado como alerta.",
    },
  }
}
