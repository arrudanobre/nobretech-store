export const ACCESSORY_CLASSIFICATION_SALE_ERROR =
  "Classifique este acessório como Durável ou Não durável antes de vender."

export const ACCESSORY_CLASSIFICATION_PUBLICATION_ERROR =
  "Classifique este acessório como Durável ou Não durável antes de publicar."

export type AccessoryClass = "durable" | "non_durable"

export function normalizeAccessoryClass(value: unknown): AccessoryClass | null {
  return value === "durable" || value === "non_durable" ? value : null
}

export function isUnclassifiedAccessory(input: {
  productType?: string | null
  accessoryClass?: string | null
}): boolean {
  return input.productType === "accessory" && normalizeAccessoryClass(input.accessoryClass) == null
}
