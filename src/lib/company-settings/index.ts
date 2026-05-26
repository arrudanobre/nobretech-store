export {
  deactivateCompanyContactChannel,
  saveCompanyContactChannel,
  upsertCompanyBrandProfile,
  upsertCompanyDocumentProfile,
} from "./mutations"

export {
  getCompanyBrandProfile,
  getCompanyContactChannels,
  getCompanyDocumentProfile,
  getCompanySettingsAuditLogs,
  getPrimaryCompanyContactChannel,
  resolveCompanyIdentity,
  resolveCompanySettings,
} from "./queries"

export type {
  BrandProfileInput,
  CompanySettingsActor,
  CompanySettingsMutationResult,
  ContactChannelInput,
  DocumentProfileInput,
} from "./mutations"

export type {
  CompanyBrandProfile,
  CompanyContactChannel,
  CompanyContactChannelType,
  CompanyDocumentProfile,
  CompanyIdentity,
  CompanySettingsAuditLog,
  CompanySettingsAuditLogAction,
  CompanySettingsAuditLogDomain,
  CompanySettingsDataByDomain,
  CompanySettingsDomain,
  CompanySettingsDomainResolution,
  CompanySettingsError,
  CompanySettingsErrorCode,
  CompanySettingsResolution,
  CompanyThemeMode,
} from "./types"
