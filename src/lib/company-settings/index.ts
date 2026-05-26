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
  getPrimaryCompanyContactChannel,
  resolveCompanyIdentity,
  resolveCompanySettings,
} from "./queries"

export type {
  BrandProfileInput,
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
  CompanySettingsDataByDomain,
  CompanySettingsDomain,
  CompanySettingsDomainResolution,
  CompanySettingsError,
  CompanySettingsErrorCode,
  CompanySettingsResolution,
  CompanyThemeMode,
} from "./types"
