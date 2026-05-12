export type NobretechDecisionPrinciple =
  | "cash_is_not_free_profit"
  | "future_receivable_is_not_immediate_cash"
  | "lost_lead_is_not_active_opportunity"
  | "low_absolute_profit_is_complement"
  | "traffic_without_anchor_product_is_risky"
  | "good_rebuy_requires_velocity_margin_demand_cash"
  | "early_discount_destroys_margin"
  | "stuck_stock_costs_opportunity"
  | "good_decision_preserves_liquidity_and_velocity"
  | "orion_must_disagree_when_data_shows_risk"

export const nobretechDecisionPrinciples: Record<NobretechDecisionPrinciple, string> = {
  cash_is_not_free_profit: "Caixa não é lucro livre.",
  future_receivable_is_not_immediate_cash: "Recebível futuro não é caixa imediato.",
  lost_lead_is_not_active_opportunity: "Lead perdido não é oportunidade ativa.",
  low_absolute_profit_is_complement: "Produto com lucro absoluto baixo é complemento, não prioridade de capital.",
  traffic_without_anchor_product_is_risky: "Tráfego sem produto âncora pode desperdiçar dinheiro.",
  good_rebuy_requires_velocity_margin_demand_cash: "Recompra boa combina giro, margem, demanda e caixa preservado.",
  early_discount_destroys_margin: "Desconto cedo demais destrói margem.",
  stuck_stock_costs_opportunity: "Estoque parado custa oportunidade.",
  good_decision_preserves_liquidity_and_velocity: "Decisão boa preserva liquidez e aumenta giro.",
  orion_must_disagree_when_data_shows_risk: "A ORION deve discordar quando os dados apontarem risco.",
}

export function shouldTreatLostLeadsAsActiveOpportunity() {
  return false
}

export function isLowAbsoluteProfit(value: number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 && parsed < 200
}

export function isTrafficRiskyWithoutAnchor(input: {
  availableStockCount: number
  campaignSales: number
  activeLeadOpportunities: number
}) {
  return input.availableStockCount <= 0 || (input.campaignSales <= 0 && input.activeLeadOpportunities <= 0)
}
