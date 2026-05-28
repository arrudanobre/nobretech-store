"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth-context"
import {
  upsertCatalogSettings,
  createCatalogTrustBadge,
  updateCatalogTrustBadge,
  deleteCatalogTrustBadge,
  type CatalogPublicSettings,
  type CatalogTrustBadge,
} from "@/lib/catalog/settings"

const VITRINE_SETTINGS_PATH = "/configuracoes/vitrine-publica"

export type ActionResponse<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } }

export async function saveCatalogSettingsAction(
  settings: Partial<CatalogPublicSettings>
): Promise<ActionResponse> {
  try {
    const context = await requirePermission("settings.edit")
    await upsertCatalogSettings(context.companyId, settings)
    revalidatePath(VITRINE_SETTINGS_PATH)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save settings"
    return { ok: false, error: { message } }
  }
}

export async function createCatalogTrustBadgeAction(
  badge: Omit<CatalogTrustBadge, "id">
): Promise<ActionResponse<{ id: string }>> {
  try {
    const context = await requirePermission("settings.edit")
    const id = await createCatalogTrustBadge(context.companyId, badge)
    revalidatePath(VITRINE_SETTINGS_PATH)
    return { ok: true, data: { id } }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create badge"
    return { ok: false, error: { message } }
  }
}

export async function updateCatalogTrustBadgeAction(
  badgeId: string,
  badge: Partial<Omit<CatalogTrustBadge, "id"> & { active: boolean }>
): Promise<ActionResponse> {
  try {
    const context = await requirePermission("settings.edit")
    await updateCatalogTrustBadge(context.companyId, badgeId, badge)
    revalidatePath(VITRINE_SETTINGS_PATH)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update badge"
    return { ok: false, error: { message } }
  }
}

export async function deactivateCatalogTrustBadgeAction(
  badgeId: string
): Promise<ActionResponse> {
  try {
    const context = await requirePermission("settings.edit")
    await deleteCatalogTrustBadge(context.companyId, badgeId)
    revalidatePath(VITRINE_SETTINGS_PATH)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete badge"
    return { ok: false, error: { message } }
  }
}
