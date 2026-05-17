// Objective type mirrors ObjectiveKey in copy-generator — kept local to avoid
// circular imports (copy-generator imports this file).
export type CtaObjective =
  | "sell_fast"
  | "generate_desire"
  | "bundle_gift"
  | "trust_proof"
  | "new_arrival"
  | "reactivate_lead"

export const CTA_BANK: Record<CtaObjective, string[]> = {
  sell_fast: [
    "Me chama e eu separo.",
    "Reservo enquanto está disponível.",
    "Me chama antes de sair.",
    "Chama que eu deixo no seu nome.",
    "Me chama e a gente fecha.",
    "Ainda tem, mas não por muito tempo.",
  ],
  generate_desire: [
    "Difícil de ignorar.",
    "Me chama e eu te mostro.",
    "A oportunidade é essa.",
    "Chama pra ver os detalhes.",
    "Aparelho certo, hora certa.",
    "Você vai entender ao vivo.",
  ],
  bundle_gift: [
    "Já sai completo.",
    "Tudo incluso, é só chamar.",
    "Me chama e eu monto o kit.",
    "Chega como novo de loja.",
    "Kit completo enquanto dura.",
    "Chama e te mostro o kit.",
  ],
  trust_proof: [
    "Chama, eu mostro tudo.",
    "Vê tudo antes de decidir.",
    "Transparência antes de fechar.",
    "Sem surpresa, me chama.",
    "Explico tudo com calma.",
    "Informação clara antes de comprar.",
  ],
  new_arrival: [
    "Acabou de entrar.",
    "Chegou hoje, chama pra ver.",
    "Me chama antes de alguém reservar.",
    "Primeiro a ver?",
    "Ainda não está na vitrine de ninguém.",
    "Chama agora que acabou de chegar.",
  ],
  reactivate_lead: [
    "Ainda procurando? Talvez esse.",
    "Lembra que você olhou esse tipo?",
    "Voltei com uma opção pra você.",
    "Pode encaixar no que você queria.",
    "Me chama, vejo a melhor condição.",
    "Se ainda fizer sentido, me chama.",
  ],
}

export interface PickStoryCtaParams {
  objective: CtaObjective
  /** Position of this story in the final stories array. */
  storyIndex: number
  /** CTAs already picked for earlier stories — avoided when possible. */
  usedCtas: string[]
  /** Incremented by the UI "Variar CTAs" button. Changes selection deterministically. */
  variationSeed: number
}

/**
 * Deterministic CTA picker. Same inputs always return the same CTA.
 * No Math.random — stable across SSR, tests, and re-renders.
 *
 * Avoids repeating a CTA already picked for an earlier story.
 * When all CTAs exhausted, falls back to full pool.
 */
export function pickStoryCta(params: PickStoryCtaParams): string {
  const { objective, storyIndex, usedCtas, variationSeed } = params
  const pool = CTA_BANK[objective]
  if (!pool || pool.length === 0) return ""
  const available = pool.filter((cta) => !usedCtas.includes(cta))
  const source = available.length > 0 ? available : pool
  return source[(storyIndex + variationSeed) % source.length]
}
