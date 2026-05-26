"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth-context"
import {
  deactivateCompanyContactChannel,
  saveCompanyContactChannel,
  upsertCompanyBrandProfile,
  upsertCompanyDocumentProfile,
  type BrandProfileInput,
  type ContactChannelInput,
  type DocumentProfileInput,
} from "@/lib/company-settings"

const SETTINGS_PATH = "/configuracoes/empresa"

export async function saveBrandProfileAction(input: BrandProfileInput) {
  const context = await requirePermission("settings.edit")
  const result = await upsertCompanyBrandProfile(context.companyId, input)
  if (result.ok) revalidatePath(SETTINGS_PATH)
  return result
}

export async function saveContactChannelAction(input: ContactChannelInput) {
  const context = await requirePermission("settings.edit")
  const result = await saveCompanyContactChannel(context.companyId, input)
  if (result.ok) revalidatePath(SETTINGS_PATH)
  return result
}

export async function deactivateContactChannelAction(contactId: string) {
  const context = await requirePermission("settings.edit")
  const result = await deactivateCompanyContactChannel(context.companyId, contactId)
  if (result.ok) revalidatePath(SETTINGS_PATH)
  return result
}

export async function saveDocumentProfileAction(input: DocumentProfileInput) {
  const context = await requirePermission("settings.edit")
  const result = await upsertCompanyDocumentProfile(context.companyId, input)
  if (result.ok) revalidatePath(SETTINGS_PATH)
  return result
}
