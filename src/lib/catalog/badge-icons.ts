// Ícones dos selos da vitrine pública.
// O banco guarda apenas a chave Iconify (ex: "mdi:whatsapp").
// Selos antigos usam chaves legadas (ex: "shield_check") e são mapeados aqui
// para manter compatibilidade sem migração de dados.

export const DEFAULT_BADGE_ICON = "mdi:shield-check"

// Chaves antigas (CHECK constraint original) -> equivalente Iconify.
const LEGACY_ICON_KEYS: Record<string, string> = {
  camera: "mdi:camera",
  shield_check: "mdi:shield-check",
  seal_check: "mdi:check-decagram",
  chat_circle: "mdi:chat-processing",
  truck: "mdi:truck-delivery",
  storefront: "mdi:storefront",
}

// Resolve qualquer chave salva para uma chave Iconify renderizável.
export function resolveBadgeIconKey(key: string | null | undefined): string {
  if (!key) return DEFAULT_BADGE_ICON
  if (key.includes(":")) return key
  return LEGACY_ICON_KEYS[key] ?? DEFAULT_BADGE_ICON
}

export type BadgeIconOption = {
  key: string
  label: string
  keywords: string
}

// Galeria pesquisável. keywords inclui termos em pt-BR e en para a busca.
export const BADGE_ICON_GALLERY: BadgeIconOption[] = [
  { key: "mdi:shield-check", label: "Garantia", keywords: "garantia escudo protecao seguranca shield warranty guarantee" },
  { key: "mdi:shield", label: "Escudo", keywords: "escudo protecao seguranca shield security" },
  { key: "mdi:check-decagram", label: "Procedência verificada", keywords: "procedencia verificado selo certificado autentico verified check" },
  { key: "mdi:check-circle", label: "Check", keywords: "check confirmado aprovado ok done circle" },
  { key: "mdi:certificate", label: "Certificado", keywords: "certificado certificate selo qualidade" },
  { key: "mdi:truck-delivery", label: "Entrega", keywords: "entrega frete delivery caminhao envio shipping" },
  { key: "mdi:truck-fast", label: "Pronta entrega", keywords: "pronta entrega rapida envio rapido truck fast express" },
  { key: "mdi:package-variant-closed", label: "Caixa", keywords: "caixa embalagem pacote package box" },
  { key: "mdi:cube-send", label: "Lacrado", keywords: "lacrado selado novo sealed embalagem package" },
  { key: "mdi:storefront", label: "Loja física", keywords: "loja fisica store storefront ponto" },
  { key: "mdi:camera", label: "Fotos reais", keywords: "camera fotos reais imagens foto photo picture" },
  { key: "mdi:headset", label: "Atendimento", keywords: "atendimento suporte sac headset support help" },
  { key: "mdi:whatsapp", label: "WhatsApp", keywords: "whatsapp contato chat zap mensagem" },
  { key: "mdi:instagram", label: "Instagram", keywords: "instagram insta rede social social" },
  { key: "mdi:phone", label: "Telefone", keywords: "telefone phone ligacao contato call" },
  { key: "mdi:email", label: "E-mail", keywords: "email e-mail correio mensagem mail" },
  { key: "mdi:map-marker", label: "Localização", keywords: "localizacao endereco mapa local location pin" },
  { key: "mdi:clock-outline", label: "Horário", keywords: "horario relogio tempo prazo clock time" },
  { key: "mdi:star", label: "Estrela", keywords: "estrela avaliacao destaque favorito star rating" },
  { key: "mdi:heart", label: "Confiança", keywords: "coracao confianca amor heart trust" },
  { key: "mdi:thumb-up", label: "Recomendado", keywords: "recomendado curtir aprovado thumb like" },
  { key: "mdi:cash", label: "Dinheiro", keywords: "dinheiro cash a vista pagamento money" },
  { key: "simple-icons:pix", label: "Pix", keywords: "pix pagamento transferencia banco payment" },
  { key: "mdi:credit-card-outline", label: "Cartão", keywords: "cartao credito debito card pagamento" },
  { key: "mdi:cash-multiple", label: "Parcelamento", keywords: "parcelamento parcelas installments dinheiro pagamento" },
  { key: "mdi:sale", label: "Desconto", keywords: "desconto promocao oferta sale tag preco" },
  { key: "mdi:swap-horizontal", label: "Troca", keywords: "troca trade-in usado swap exchange" },
  { key: "mdi:lock-check", label: "Segurança", keywords: "seguranca cadeado protecao lock security safe" },
  { key: "simple-icons:apple", label: "Apple", keywords: "apple iphone ipad mac marca brand" },
  { key: "mdi:diamond-stone", label: "Premium", keywords: "premium diamante qualidade luxo diamond" },
]
