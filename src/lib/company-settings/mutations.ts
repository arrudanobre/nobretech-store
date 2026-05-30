import 'server-only'

import { pool } from '@/lib/db'
import type { CompanyContactChannelType, CompanyThemeMode } from './types'
import { buildAuditMetadata, recordCompanySettingsAuditLog, rowToSnapshot } from './audit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HEX_RE = /^#[0-9a-f]{6}$/i
const LOCALE_RE = /^[a-z]{2}(?:-[A-Z]{2})?$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SAFE_PHONE_RE = /^[0-9+\-().\s]*$/
const ASSET_PATH_RE = /^\/(?!\/)(?!.*\.\.)[A-Za-z0-9\/_ .\-@]+$/

const contactTypes: CompanyContactChannelType[] = [
  'whatsapp',
  'instagram',
  'email',
  'phone',
  'website',
  'address',
  'other',
]

const themeModes: CompanyThemeMode[] = ['light', 'dark', 'system']

export type CompanySettingsMutationResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

export type CompanySettingsActor = {
  userId: string | null
  email: string | null
}

export type BrandProfileInput = {
  displayName: string
  legalName: string
  shortName: string
  slogan: string
  publicDescription: string
  canonicalDomain: string
  city: string
  state: string
  locale: string
  primaryColor: string
  accentColor: string
  logoUrl: string
  faviconUrl: string
  appleIconUrl: string
  ogImageUrl: string
  catalogOgImageUrl: string
  portalOgImageUrl: string
  themeMode: CompanyThemeMode
}

export type ContactChannelInput = {
  id?: string | null
  channelType: CompanyContactChannelType
  label: string
  value: string
  url: string
  isPrimary: boolean
  isPublic: boolean
  sortOrder: number
  active: boolean
}

export type DocumentProfileInput = {
  issuerName: string
  legalName: string
  documentNumber: string
  addressLine: string
  city: string
  state: string
  phone: string
  email: string
  defaultSellerName: string
  signatureLabel: string
  active: boolean
  effectiveFrom: string
  effectiveUntil: string
}

function clean(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function nullIfEmpty(value: string) {
  const trimmed = clean(value)
  return trimmed ? trimmed : null
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

function isSafeAssetReference(value: string) {
  if (!value) return true
  return ASSET_PATH_RE.test(value) || isValidUrl(value)
}

function normalizeState(value: string) {
  return clean(value).toUpperCase()
}

function normalizeWhatsapp(value: string) {
  return value.replace(/\D/g, '')
}

function buildError(message: string, fieldErrors?: Record<string, string>): CompanySettingsMutationResult {
  return { ok: false, message, fieldErrors }
}

function databaseError(error: unknown): CompanySettingsMutationResult {
  const pgError = error as { code?: string; constraint?: string; message?: string }

  if (pgError.code === '23505') {
    if (pgError.constraint === 'idx_company_contact_channels_one_primary_type') {
      return buildError('Ja existe um contato principal ativo para este tipo.')
    }
    if (pgError.constraint === 'idx_company_brand_profile_one_active') {
      return buildError('Ja existe um perfil de marca ativo para esta empresa.')
    }
    if (pgError.constraint === 'idx_company_document_profile_one_active') {
      return buildError('Ja existe um perfil documental ativo para esta empresa.')
    }
  }

  return buildError(pgError.message || 'Nao foi possivel salvar as configuracoes da empresa.')
}

function validateBrandProfile(input: BrandProfileInput) {
  const errors: Record<string, string> = {}
  const displayName = clean(input.displayName)
  const shortName = clean(input.shortName)
  const state = normalizeState(input.state)
  const locale = clean(input.locale) || 'pt-BR'
  const themeMode = input.themeMode

  if (!displayName) errors.displayName = 'Informe o nome publico.'
  if (!shortName) errors.shortName = 'Informe o nome curto.'
  if (input.canonicalDomain && !isValidUrl(clean(input.canonicalDomain))) {
    errors.canonicalDomain = 'Informe uma URL valida.'
  }
  if (state && state.length !== 2) errors.state = 'UF deve ter 2 caracteres.'
  if (!LOCALE_RE.test(locale)) errors.locale = 'Use um locale como pt-BR.'
  if (input.primaryColor && !HEX_RE.test(clean(input.primaryColor))) {
    errors.primaryColor = 'Use cor hexadecimal, exemplo #07162f.'
  }
  if (input.accentColor && !HEX_RE.test(clean(input.accentColor))) {
    errors.accentColor = 'Use cor hexadecimal, exemplo #3A6BC4.'
  }
  if (!themeModes.includes(themeMode)) errors.themeMode = 'Tema invalido.'

  for (const field of ['logoUrl', 'faviconUrl', 'appleIconUrl', 'ogImageUrl', 'catalogOgImageUrl', 'portalOgImageUrl'] as const) {
    if (!isSafeAssetReference(clean(input[field]))) {
      errors[field] = 'Use um caminho interno seguro ou uma URL valida.'
    }
  }

  return {
    errors,
    values: {
      displayName,
      legalName: nullIfEmpty(input.legalName),
      shortName,
      slogan: nullIfEmpty(input.slogan),
      publicDescription: nullIfEmpty(input.publicDescription),
      canonicalDomain: nullIfEmpty(input.canonicalDomain),
      city: nullIfEmpty(input.city),
      state: state || null,
      locale,
      primaryColor: nullIfEmpty(input.primaryColor),
      accentColor: nullIfEmpty(input.accentColor),
      logoUrl: nullIfEmpty(input.logoUrl),
      faviconUrl: nullIfEmpty(input.faviconUrl),
      appleIconUrl: nullIfEmpty(input.appleIconUrl),
      ogImageUrl: nullIfEmpty(input.ogImageUrl),
      catalogOgImageUrl: nullIfEmpty(input.catalogOgImageUrl),
      portalOgImageUrl: nullIfEmpty(input.portalOgImageUrl),
      themeMode,
    },
  }
}

function validateContactChannel(input: ContactChannelInput) {
  const errors: Record<string, string> = {}
  const channelType = input.channelType
  const label = clean(input.label)
  let value = clean(input.value)
  const url = clean(input.url)
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0

  if (input.id && !UUID_RE.test(input.id)) errors.id = 'Contato invalido.'
  if (!contactTypes.includes(channelType)) errors.channelType = 'Tipo de contato invalido.'
  if (!label) errors.label = 'Informe o label.'
  if (!value) errors.value = 'Informe o valor.'
  if (url && !isValidUrl(url)) errors.url = 'Informe uma URL valida.'

  if (channelType === 'whatsapp') {
    value = normalizeWhatsapp(value)
    if (!value) errors.value = 'WhatsApp deve conter digitos.'
  }

  if (channelType === 'email' && value && !EMAIL_RE.test(value)) {
    errors.value = 'Informe um e-mail valido.'
  }

  return {
    errors,
    values: {
      id: input.id || null,
      channelType,
      label,
      value,
      url: url || null,
      isPrimary: Boolean(input.isPrimary),
      isPublic: Boolean(input.isPublic),
      sortOrder,
      active: Boolean(input.active),
    },
  }
}

function validateDocumentProfile(input: DocumentProfileInput) {
  const errors: Record<string, string> = {}
  const issuerName = clean(input.issuerName)
  const legalName = clean(input.legalName)
  const state = normalizeState(input.state)
  const email = clean(input.email)
  const phone = clean(input.phone)
  const effectiveFrom = clean(input.effectiveFrom)
  const effectiveUntil = clean(input.effectiveUntil)

  if (!issuerName) errors.issuerName = 'Informe o nome do emissor.'
  if (!legalName) errors.legalName = 'Informe o nome legal.'
  if (state && state.length !== 2) errors.state = 'UF deve ter 2 caracteres.'
  if (email && !EMAIL_RE.test(email)) errors.email = 'Informe um e-mail valido.'
  if (phone && !SAFE_PHONE_RE.test(phone)) errors.phone = 'Telefone contem caracteres invalidos.'
  if (!effectiveFrom) errors.effectiveFrom = 'Informe a vigencia inicial.'

  if (effectiveFrom && Number.isNaN(Date.parse(effectiveFrom))) {
    errors.effectiveFrom = 'Data inicial invalida.'
  }
  if (effectiveUntil && Number.isNaN(Date.parse(effectiveUntil))) {
    errors.effectiveUntil = 'Data final invalida.'
  }
  if (effectiveFrom && effectiveUntil && Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) {
    errors.effectiveUntil = 'Vigencia final deve ser posterior a inicial.'
  }

  return {
    errors,
    values: {
      issuerName,
      legalName,
      documentNumber: nullIfEmpty(input.documentNumber),
      addressLine: nullIfEmpty(input.addressLine),
      city: nullIfEmpty(input.city),
      state: state || null,
      phone: phone || null,
      email: email || null,
      defaultSellerName: nullIfEmpty(input.defaultSellerName),
      signatureLabel: nullIfEmpty(input.signatureLabel),
      active: Boolean(input.active),
      effectiveFrom,
      effectiveUntil: effectiveUntil || null,
    },
  }
}

export async function upsertCompanyBrandProfile(
  companyId: string,
  input: BrandProfileInput,
  actor: CompanySettingsActor
): Promise<CompanySettingsMutationResult> {
  if (!UUID_RE.test(companyId)) return buildError('Empresa invalida.')

  const { errors, values } = validateBrandProfile(input)
  if (Object.keys(errors).length > 0) return buildError('Revise os campos de marca.', errors)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM company_brand_profile WHERE company_id = $1 AND active = TRUE ORDER BY updated_at DESC LIMIT 1`,
      [companyId]
    )
    const before = rowToSnapshot(beforeResult.rows[0])

    const upsertResult = await client.query<{ id: string }>(
      `WITH active_profile AS (
        SELECT id FROM company_brand_profile WHERE company_id = $1 AND active = TRUE ORDER BY updated_at DESC LIMIT 1
      ),
      updated AS (
        UPDATE company_brand_profile
        SET
          display_name = $2,
          legal_name = $3,
          short_name = $4,
          slogan = $5,
          public_description = $6,
          canonical_domain = $7,
          city = $8,
          state = $9,
          locale = $10,
          primary_color = $11,
          accent_color = $12,
          logo_url = $13,
          favicon_url = $14,
          apple_icon_url = $15,
          og_image_url = $16,
          theme_mode = $17,
          catalog_og_image_url = $18,
          portal_og_image_url = $19,
          active = TRUE
        WHERE id = (SELECT id FROM active_profile)
        RETURNING id
      ),
      inserted AS (
        INSERT INTO company_brand_profile (
          company_id, display_name, legal_name, short_name, slogan, public_description,
          canonical_domain, city, state, locale, primary_color, accent_color,
          logo_url, favicon_url, apple_icon_url, og_image_url, theme_mode,
          catalog_og_image_url, portal_og_image_url, active
        )
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, TRUE
        WHERE NOT EXISTS (SELECT 1 FROM updated)
        RETURNING id
      )
      SELECT id FROM updated UNION ALL SELECT id FROM inserted`,
      [
        companyId, values.displayName, values.legalName, values.shortName, values.slogan,
        values.publicDescription, values.canonicalDomain, values.city, values.state,
        values.locale, values.primaryColor, values.accentColor, values.logoUrl,
        values.faviconUrl, values.appleIconUrl, values.ogImageUrl, values.themeMode,
        values.catalogOgImageUrl, values.portalOgImageUrl,
      ]
    )
    const entityId = upsertResult.rows[0]?.id ?? null

    const afterResult = entityId
      ? await client.query<Record<string, unknown>>(
          `SELECT * FROM company_brand_profile WHERE id = $1`,
          [entityId]
        )
      : null
    const after = rowToSnapshot(afterResult?.rows[0])

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: 'brand',
      entityTable: 'company_brand_profile',
      entityId,
      action: 'update_brand',
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({ action: 'update_brand', domain: 'brand', beforeSnapshot: before, afterSnapshot: after }),
    })

    await client.query('COMMIT')
    return { ok: true }
  } catch (error) {
    await client.query('ROLLBACK')
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function saveCompanyContactChannel(
  companyId: string,
  input: ContactChannelInput,
  actor: CompanySettingsActor
): Promise<CompanySettingsMutationResult> {
  if (!UUID_RE.test(companyId)) return buildError('Empresa invalida.')

  const { errors, values } = validateContactChannel(input)
  if (Object.keys(errors).length > 0) return buildError('Revise os campos do contato.', errors)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (values.active && values.isPrimary) {
      const duplicate = await client.query<{ id: string }>(
        `SELECT id FROM company_contact_channels
          WHERE company_id = $1 AND channel_type = $2 AND active = TRUE AND is_primary = TRUE
            AND ($3::uuid IS NULL OR id <> $3::uuid)
          LIMIT 1`,
        [companyId, values.channelType, values.id]
      )
      if (duplicate.rowCount) {
        await client.query('ROLLBACK')
        return buildError('Ja existe um contato principal ativo para este tipo.', {
          isPrimary: 'Inative ou edite o contato principal atual antes de criar outro.',
        })
      }
    }

    const beforeResult = values.id
      ? await client.query<Record<string, unknown>>(
          `SELECT * FROM company_contact_channels WHERE id = $1 AND company_id = $2`,
          [values.id, companyId]
        )
      : null
    const before = rowToSnapshot(beforeResult?.rows[0])
    const wasActive = beforeResult?.rows[0]?.active === true

    let entityId: string | null = null

    if (values.id) {
      const result = await client.query<{ id: string }>(
        `UPDATE company_contact_channels
          SET channel_type = $3, label = $4, value = $5, url = $6,
              is_primary = $7, is_public = $8, sort_order = $9, active = $10
          WHERE id = $1 AND company_id = $2
          RETURNING id`,
        [
          values.id, companyId, values.channelType, values.label, values.value,
          values.url, values.isPrimary, values.isPublic, values.sortOrder, values.active,
        ]
      )
      if (!result.rowCount) {
        await client.query('ROLLBACK')
        return buildError('Contato nao encontrado para esta empresa.')
      }
      entityId = result.rows[0]?.id ?? null
    } else {
      const result = await client.query<{ id: string }>(
        `INSERT INTO company_contact_channels (
          company_id, channel_type, label, value, url, is_primary, is_public, sort_order, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          companyId, values.channelType, values.label, values.value,
          values.url, values.isPrimary, values.isPublic, values.sortOrder, values.active,
        ]
      )
      entityId = result.rows[0]?.id ?? null
    }

    const afterResult = entityId
      ? await client.query<Record<string, unknown>>(
          `SELECT * FROM company_contact_channels WHERE id = $1`,
          [entityId]
        )
      : null
    const after = rowToSnapshot(afterResult?.rows[0])

    const action =
      !values.id
        ? 'create_contact'
        : !wasActive && values.active
        ? 'reactivate_contact'
        : 'update_contact'

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: 'contact',
      entityTable: 'company_contact_channels',
      entityId,
      action,
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({ action, domain: 'contact', beforeSnapshot: before, afterSnapshot: after }),
    })

    await client.query('COMMIT')
    return { ok: true }
  } catch (error) {
    await client.query('ROLLBACK')
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function deactivateCompanyContactChannel(
  companyId: string,
  contactId: string,
  actor: CompanySettingsActor
): Promise<CompanySettingsMutationResult> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(contactId)) {
    return buildError('Contato invalido.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM company_contact_channels WHERE id = $1 AND company_id = $2`,
      [contactId, companyId]
    )
    const before = rowToSnapshot(beforeResult.rows[0])

    const result = await client.query(
      `UPDATE company_contact_channels SET active = FALSE WHERE id = $1 AND company_id = $2`,
      [contactId, companyId]
    )
    if (!result.rowCount) {
      await client.query('ROLLBACK')
      return buildError('Contato nao encontrado para esta empresa.')
    }

    const afterResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM company_contact_channels WHERE id = $1`,
      [contactId]
    )
    const after = rowToSnapshot(afterResult.rows[0])

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: 'contact',
      entityTable: 'company_contact_channels',
      entityId: contactId,
      action: 'deactivate_contact',
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({ action: 'deactivate_contact', domain: 'contact', beforeSnapshot: before, afterSnapshot: after }),
    })

    await client.query('COMMIT')
    return { ok: true }
  } catch (error) {
    await client.query('ROLLBACK')
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function upsertCompanyDocumentProfile(
  companyId: string,
  input: DocumentProfileInput,
  actor: CompanySettingsActor
): Promise<CompanySettingsMutationResult> {
  if (!UUID_RE.test(companyId)) return buildError('Empresa invalida.')

  const { errors, values } = validateDocumentProfile(input)
  if (Object.keys(errors).length > 0) return buildError('Revise os campos do perfil documental.', errors)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM company_document_profile WHERE company_id = $1 AND active = TRUE ORDER BY effective_from DESC, updated_at DESC LIMIT 1`,
      [companyId]
    )
    const before = rowToSnapshot(beforeResult.rows[0])

    const upsertResult = await client.query<{ id: string }>(
      `WITH active_profile AS (
        SELECT id FROM company_document_profile WHERE company_id = $1 AND active = TRUE ORDER BY effective_from DESC, updated_at DESC LIMIT 1
      ),
      updated AS (
        UPDATE company_document_profile
        SET issuer_name = $2, legal_name = $3, document_number = $4, address_line = $5,
            city = $6, state = $7, phone = $8, email = $9, default_seller_name = $10,
            signature_label = $11, active = $12, effective_from = $13, effective_until = $14
        WHERE id = (SELECT id FROM active_profile)
        RETURNING id
      ),
      inserted AS (
        INSERT INTO company_document_profile (
          company_id, issuer_name, legal_name, document_number, address_line,
          city, state, phone, email, default_seller_name, signature_label,
          active, effective_from, effective_until
        )
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        WHERE NOT EXISTS (SELECT 1 FROM updated)
        RETURNING id
      )
      SELECT id FROM updated UNION ALL SELECT id FROM inserted`,
      [
        companyId, values.issuerName, values.legalName, values.documentNumber, values.addressLine,
        values.city, values.state, values.phone, values.email, values.defaultSellerName,
        values.signatureLabel, values.active, values.effectiveFrom, values.effectiveUntil,
      ]
    )
    const entityId = upsertResult.rows[0]?.id ?? null

    const afterResult = entityId
      ? await client.query<Record<string, unknown>>(
          `SELECT * FROM company_document_profile WHERE id = $1`,
          [entityId]
        )
      : null
    const after = rowToSnapshot(afterResult?.rows[0])

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: 'document',
      entityTable: 'company_document_profile',
      entityId,
      action: 'update_document_profile',
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({ action: 'update_document_profile', domain: 'document', beforeSnapshot: before, afterSnapshot: after }),
    })

    await client.query('COMMIT')
    return { ok: true }
  } catch (error) {
    await client.query('ROLLBACK')
    return databaseError(error)
  } finally {
    client.release()
  }
}
