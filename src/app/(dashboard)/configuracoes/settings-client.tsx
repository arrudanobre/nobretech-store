"use client"

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowRight,
  Ban,
  Box,
  Building,
  Check,
  DollarSign,
  FileText,
  Folder,
  Grid2X2,
  Info,
  Layers3,
  ListChecks,
  Loader2,
  Lock,
  Mail,
  MoreVertical,
  Palette,
  Pencil,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import {
  canAccess,
  canManageUsers,
  roleDescriptions,
  roleLabels,
  rolePermissions,
  type PermissionKey,
  type UserRole,
} from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { DEFAULT_COLOR_SUGGESTIONS, normalizeCatalogName, type ProductType } from "@/lib/catalog-config"

type CompanySettings = {
  phone?: string
  email?: string
  address?: string
  warranty_template?: string
}

type TeamMember = {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  status?: "active" | "inactive" | null
  created_at?: string | null
}

type CurrentUser = {
  id: string
  name: string
  email: string
  role: UserRole
  avatarUrl: string | null
  companyId: string
}

type CompanyForm = {
  id: string
  name: string
  slug: string
  logo_url: string
  phone: string
  email: string
  address: string
  warranty_template: string
  settings: CompanySettings
}

type CatalogCategoryRow = {
  id: string
  name: string
  slug: string
  legacy_key?: string | null
  product_type?: ProductType | null
  normalized_name?: string | null
  deleted_at?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

type CatalogSubcategoryRow = {
  id: string
  category_id: string
  name: string
  slug: string
  legacy_model?: string | null
  normalized_name?: string | null
  deleted_at?: string | null
  is_active?: boolean | null
  default_warranty_policy_id?: string | null
}

type WarrantyPolicyOption = {
  id: string
  name: string
  warrantyNature: string
  calculationMode: "calendar_months" | "fixed_days" | "manual_dates"
  defaultMonths: number | null
  defaultDays: number | null
  selectionLabel: string | null
}

type CatalogAttributeRow = {
  id: string
  category_id: string
  name: string
  slug: string
  input_type: string
  normalized_name?: string | null
  deleted_at?: string | null
  is_required?: boolean | null
  is_active?: boolean | null
}

type CatalogAttributeOptionRow = {
  id: string
  attribute_id: string
  label: string
  value: string
  normalized_name?: string | null
  deleted_at?: string | null
  is_active?: boolean | null
}

type CatalogColorRow = {
  id: string
  category_id?: string | null
  name: string
  hex: string
  normalized_name?: string | null
  deleted_at?: string | null
  is_active?: boolean | null
}

type CatalogSubcategoryColorRow = {
  id: string
  subcategory_id: string
  color_id: string
  sort_order?: number | null
  is_active?: boolean | null
  deleted_at?: string | null
}

type CatalogPanelTab = "categories" | "attributes" | "colors" | "general"
type CatalogColorFilter = "active" | "inactive" | "all"

type CatalogDrawerState =
  | { type: "category"; mode: "create" | "edit"; id?: string }
  | { type: "subcategory"; mode: "create" | "edit"; id?: string }
  | { type: "attribute"; mode: "create" | "edit"; id?: string }
  | { type: "option"; mode: "create"; attributeId?: string }
  | { type: "color"; mode: "create" | "edit"; id?: string }
  | { type: "modelColors"; mode: "manage"; subcategoryId: string }

const tabs = [
  { key: "company", label: "Empresa", icon: Building },
  { key: "catalog", label: "Catálogo", icon: Layers3 },
  { key: "team", label: "Equipe", icon: Users },
  { key: "permissions", label: "Permissões", icon: ShieldCheck },
  { key: "warranty", label: "Garantia", icon: FileText },
  { key: "finance", label: "Financeiro", icon: DollarSign },
] as const

const permissionRows: { label: string; permission: PermissionKey }[] = [
  { label: "Editar configurações", permission: "settings.edit" },
  { label: "Gerenciar equipe", permission: "users.manage" },
  { label: "Acessar financeiro", permission: "finance.view" },
  { label: "Editar financeiro", permission: "finance.edit" },
  { label: "Ver DRE", permission: "finance.dre" },
  { label: "Alterar taxas", permission: "finance.tax_settings" },
  { label: "Excluir registros sensíveis", permission: "sensitive.delete" },
  { label: "Editar custos", permission: "inventory.edit_cost" },
  { label: "Cancelar vendas", permission: "sales.cancel" },
]

const roleBadgeVariant: Record<UserRole, "green" | "blue" | "yellow" | "gray"> = {
  owner: "green",
  manager: "blue",
  operator: "yellow",
  reseller: "gray",
}

function formatPhone(value: string) {
  const numbers = value.replace(/\D/g, "").slice(0, 11)
  if (numbers.length > 10) return numbers.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3")
  if (numbers.length > 2) return numbers.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3")
  if (numbers.length > 0) return numbers.replace(/^(\d{2})/, "($1) ")
  return numbers
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value))
}

function memberInitial(member: TeamMember) {
  return (member.full_name || member.email).trim().charAt(0).toUpperCase() || "U"
}

function defaultCompanyForm(companyId: string): CompanyForm {
  return {
    id: companyId,
    name: "",
    slug: "",
    logo_url: "",
    phone: "",
    email: "",
    address: "",
    warranty_template: "",
    settings: {},
  }
}

export function ConfiguracoesClient({ currentUser }: { currentUser: CurrentUser }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("company")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [company, setCompany] = useState<CompanyForm>(() => defaultCompanyForm(currentUser.companyId))
  const [team, setTeam] = useState<TeamMember[]>([])
  const [newMember, setNewMember] = useState({ full_name: "", email: "", role: "operator" as UserRole })
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState({ full_name: "", role: "operator" as UserRole })
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategoryRow[]>([])
  const [catalogSubcategories, setCatalogSubcategories] = useState<CatalogSubcategoryRow[]>([])
  const [catalogAttributes, setCatalogAttributes] = useState<CatalogAttributeRow[]>([])
  const [catalogAttributeOptions, setCatalogAttributeOptions] = useState<CatalogAttributeOptionRow[]>([])
  const [catalogColors, setCatalogColors] = useState<CatalogColorRow[]>([])
  const [catalogSubcategoryColors, setCatalogSubcategoryColors] = useState<CatalogSubcategoryColorRow[]>([])
  const [newCategory, setNewCategory] = useState({ name: "", product_type: "device" as ProductType })
  const [newSubcategory, setNewSubcategory] = useState<{ category_id: string; name: string; default_warranty_policy_id: string }>({
    category_id: "",
    name: "",
    default_warranty_policy_id: "",
  })
  const [warrantyPolicyOptions, setWarrantyPolicyOptions] = useState<WarrantyPolicyOption[]>([])
  const [newAttribute, setNewAttribute] = useState({ category_id: "", name: "", input_type: "select" })
  const [newOption, setNewOption] = useState({ attribute_id: "", label: "" })
  const [newColor, setNewColor] = useState({ category_id: "", name: "", hex: "#111827" })
  const [catalogPanelTab, setCatalogPanelTab] = useState<CatalogPanelTab>("categories")
  const [selectedCategoryId, setSelectedCategoryId] = useState("")
  const [categorySearch, setCategorySearch] = useState("")
  const [subcategorySearch, setSubcategorySearch] = useState("")
  const [attributeCategoryId, setAttributeCategoryId] = useState("")
  const [attributeSubcategoryId, setAttributeSubcategoryId] = useState("")
  const [colorSearch, setColorSearch] = useState("")
  const [colorStatusFilter, setColorStatusFilter] = useState<CatalogColorFilter>("active")
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("")
  const [modelColorSearch, setModelColorSearch] = useState("")
  const [modelColorFilter, setModelColorFilter] = useState<CatalogColorFilter>("active")
  const [newModelColor, setNewModelColor] = useState({ name: "", hex: "#111827" })
  const [catalogDrawer, setCatalogDrawer] = useState<CatalogDrawerState | null>(null)

  const canEditSettings = canAccess(currentUser.role, "settings.edit")
  const canManageTeam = canManageUsers(currentUser.role)

  const activeMembers = useMemo(() => team.filter((member) => (member.status || "active") === "active").length, [team])
  const attributeById = useMemo(() => new Map(catalogAttributes.map((attribute) => [attribute.id, attribute])), [catalogAttributes])
  const categoryById = useMemo(() => new Map(catalogCategories.map((category) => [category.id, category])), [catalogCategories])
  const catalogPanelTabs = useMemo(
    () => [
      { key: "categories" as const, label: "Categorias", icon: Folder },
      { key: "attributes" as const, label: "Atributos", icon: ListChecks },
      { key: "colors" as const, label: "Cores", icon: Palette },
      { key: "general" as const, label: "Geral", icon: Settings2 },
    ],
    []
  )
  const selectedCategory = categoryById.get(selectedCategoryId) || catalogCategories[0] || null
  const selectedSubcategory = catalogSubcategories.find((item) => item.id === selectedSubcategoryId) || null
  const attributeSelectedCategory = categoryById.get(attributeCategoryId || selectedCategory?.id || "") || selectedCategory
  const selectedCategorySubcategories = useMemo(
    () => catalogSubcategories.filter((item) => item.category_id === selectedCategory?.id),
    [catalogSubcategories, selectedCategory?.id]
  )
  const attributeCategorySubcategories = useMemo(
    () => catalogSubcategories.filter((item) => item.category_id === attributeSelectedCategory?.id),
    [attributeSelectedCategory?.id, catalogSubcategories]
  )
  const selectedCategoryAttributes = useMemo(
    () => catalogAttributes.filter((item) => item.category_id === selectedCategory?.id),
    [catalogAttributes, selectedCategory?.id]
  )
  const selectedCategoryColors = useMemo(
    () => catalogColors.filter((item) => !item.category_id || item.category_id === selectedCategory?.id),
    [catalogColors, selectedCategory?.id]
  )
  const modelColorLinks = useMemo(
    () => catalogSubcategoryColors.filter((item) => item.subcategory_id === selectedSubcategory?.id),
    [catalogSubcategoryColors, selectedSubcategory?.id]
  )
  const activeModelColorLinks = useMemo(
    () => modelColorLinks.filter(isActiveCatalogRow),
    [modelColorLinks]
  )
  const modelColorLinkByColorId = useMemo(() => new Map(modelColorLinks.map((item) => [item.color_id, item])), [modelColorLinks])
  const selectedModelColors = useMemo(() => {
    const ids = new Set(activeModelColorLinks.map((item) => item.color_id))
    return selectedCategoryColors.filter((color) => ids.has(color.id) && isActiveCatalogRow(color))
  }, [activeModelColorLinks, selectedCategoryColors])
  const existingNewCatalogColor = useMemo(() => {
    const normalized = normalizeCatalogName(newColor.name)
    if (!normalized) return null
    const editingColorId = catalogDrawer?.type === "color" && catalogDrawer.mode === "edit" ? catalogDrawer.id : null
    return catalogColors.find((color) => color.id !== editingColorId && (color.category_id || "") === (newColor.category_id || "") && normalizeCatalogName(color.name) === normalized) || null
  }, [catalogColors, catalogDrawer, newColor.category_id, newColor.name])
  const modelColorRows = useMemo(() => {
    const search = normalizeCatalogName(modelColorSearch)
    return selectedCategoryColors
      .map((color) => {
        const link = modelColorLinkByColorId.get(color.id)
        return {
          color,
          link,
          colorActive: isActiveCatalogRow(color),
          linkActive: Boolean(link && isActiveCatalogRow(link)),
        }
      })
      .filter((row) => {
        if (modelColorFilter === "active") return row.colorActive && !Boolean(row.link && !row.linkActive)
        if (modelColorFilter === "inactive") return !row.colorActive || Boolean(row.link && !row.linkActive)
        return true
      })
      .filter((row) => !search || normalizeCatalogName(row.color.name).includes(search) || row.color.hex.toLowerCase().includes(search))
      .sort((a, b) => {
        if (a.linkActive !== b.linkActive) return a.linkActive ? -1 : 1
        if (a.colorActive !== b.colorActive) return a.colorActive ? -1 : 1
        return a.color.name.localeCompare(b.color.name)
      })
  }, [modelColorFilter, modelColorLinkByColorId, modelColorSearch, selectedCategoryColors])
  const existingNewModelColor = useMemo(() => {
    const normalized = normalizeCatalogName(newModelColor.name)
    if (!normalized) return null
    return selectedCategoryColors.find((color) => normalizeCatalogName(color.name) === normalized) || null
  }, [newModelColor.name, selectedCategoryColors])
  const existingNewModelColorLink = existingNewModelColor ? modelColorLinkByColorId.get(existingNewModelColor.id) || null : null
  const newModelColorHexValid = isValidHexColor(newModelColor.hex)
  const attributeOptionsByAttributeId = useMemo(() => {
    const options = new Map<string, CatalogAttributeOptionRow[]>()
    for (const option of catalogAttributeOptions) {
      const current = options.get(option.attribute_id) || []
      current.push(option)
      options.set(option.attribute_id, current)
    }
    return options
  }, [catalogAttributeOptions])
  const filteredCategories = useMemo(() => {
    const search = normalizeCatalogName(categorySearch)
    return catalogCategories.filter((category) => !search || normalizeCatalogName(category.name).includes(search))
  }, [catalogCategories, categorySearch])
  const filteredSubcategories = useMemo(() => {
    const search = normalizeCatalogName(subcategorySearch)
    return selectedCategorySubcategories.filter((subcategory) => !search || normalizeCatalogName(subcategory.name).includes(search))
  }, [selectedCategorySubcategories, subcategorySearch])
  const filteredAttributes = useMemo(() => {
    const categoryId = attributeCategoryId || selectedCategory?.id || ""
    return catalogAttributes.filter((attribute) => !categoryId || attribute.category_id === categoryId)
  }, [attributeCategoryId, catalogAttributes, selectedCategory?.id])
  const filteredColors = useMemo(() => {
    const search = normalizeCatalogName(colorSearch)
    return catalogColors
      .filter((color) => {
        const active = isActiveCatalogRow(color)
        if (colorStatusFilter === "active") return active
        if (colorStatusFilter === "inactive") return !active
        return true
      })
      .filter((color) => !search || normalizeCatalogName(color.name).includes(search) || color.hex.toLowerCase().includes(search))
      .sort((a, b) => {
        const aActive = isActiveCatalogRow(a)
        const bActive = isActiveCatalogRow(b)
        if (aActive !== bActive) return aActive ? -1 : 1
        const categoryA = categoryById.get(a.category_id || "")?.name || ""
        const categoryB = categoryById.get(b.category_id || "")?.name || ""
        return categoryA.localeCompare(categoryB) || a.name.localeCompare(b.name)
      })
  }, [catalogColors, categoryById, colorSearch, colorStatusFilter])

  function slugify(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  }

  function normalizeHexColorInput(value: string) {
    const clean = value.trim().replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
    return clean ? `#${clean}` : "#"
  }

  function isValidHexColor(value: string) {
    return /^#[0-9A-F]{6}$/.test(value)
  }

  function isActiveCatalogRow(row: { is_active?: boolean | null; deleted_at?: string | null }) {
    return row.is_active !== false && !row.deleted_at
  }

  function hasDuplicateName<T extends { id?: string; name?: string; label?: string; normalized_name?: string | null; category_id?: string | null; attribute_id?: string | null }>(
    rows: T[],
    name: string,
    scope: Partial<Pick<T, "category_id" | "attribute_id">> = {},
    ignoreId?: string
  ) {
    const normalized = normalizeCatalogName(name)
    return rows.some((row) => {
      if (ignoreId && row.id === ignoreId) return false
      if ("category_id" in scope && row.category_id !== scope.category_id) return false
      if ("attribute_id" in scope && row.attribute_id !== scope.attribute_id) return false
      const rowName = row.normalized_name || normalizeCatalogName(String(row.name || row.label || ""))
      return rowName === normalized
    })
  }

  function openCatalogDrawer(state: CatalogDrawerState) {
    if (state.type === "category") {
      const category = state.id ? categoryById.get(state.id) : null
      setNewCategory({ name: category?.name || "", product_type: (category?.product_type || "device") as ProductType })
    }

    if (state.type === "subcategory") {
      const subcategory = state.id ? catalogSubcategories.find((item) => item.id === state.id) : null
      setNewSubcategory({
        category_id: subcategory?.category_id || selectedCategory?.id || "",
        name: subcategory?.name || "",
        default_warranty_policy_id: subcategory?.default_warranty_policy_id || "",
      })
    }

    if (state.type === "attribute") {
      const attribute = state.id ? catalogAttributes.find((item) => item.id === state.id) : null
      setNewAttribute({
        category_id: attribute?.category_id || selectedCategory?.id || "",
        name: attribute?.name || "",
        input_type: attribute?.input_type || "select",
      })
    }

    if (state.type === "option") {
      setNewOption({ attribute_id: state.attributeId || "", label: "" })
    }

    if (state.type === "color") {
      const color = state.id ? catalogColors.find((item) => item.id === state.id) : null
      setNewColor({
        category_id: color?.category_id || selectedCategory?.id || "",
        name: color?.name || "",
        hex: color?.hex || "#111827",
      })
    }

    if (state.type === "modelColors") {
      setSelectedSubcategoryId(state.subcategoryId)
      setModelColorSearch("")
      setModelColorFilter("active")
      setNewModelColor({ name: "", hex: "#111827" })
    }

    setCatalogDrawer(state)
  }

  async function handleSaveCatalogDrawer() {
    if (!catalogDrawer) return

    if (catalogDrawer.type === "category") {
      if (catalogDrawer.mode === "create") {
        await handleCreateCategory()
        return
      }
      if (!catalogDrawer.id) return
      const ok = await updateCatalogRow("product_categories", catalogDrawer.id, {
        name: newCategory.name.trim(),
        slug: slugify(newCategory.name),
        product_type: newCategory.product_type,
      })
      if (ok) setCatalogDrawer(null)
    }

    if (catalogDrawer.type === "subcategory") {
      if (catalogDrawer.mode === "create") {
        await handleCreateSubcategory()
        return
      }
      if (!catalogDrawer.id) return
      const ok = await updateCatalogRow("product_subcategories", catalogDrawer.id, {
        category_id: newSubcategory.category_id,
        name: newSubcategory.name.trim(),
        slug: slugify(newSubcategory.name),
        default_warranty_policy_id: newSubcategory.default_warranty_policy_id || null,
      })
      if (ok) setCatalogDrawer(null)
    }

    if (catalogDrawer.type === "attribute") {
      if (catalogDrawer.mode === "create") {
        await handleCreateAttribute()
        return
      }
      if (!catalogDrawer.id) return
      const ok = await updateCatalogRow("product_attributes", catalogDrawer.id, {
        category_id: newAttribute.category_id,
        name: newAttribute.name.trim(),
        slug: slugify(newAttribute.name),
        input_type: newAttribute.input_type,
      })
      if (ok) setCatalogDrawer(null)
    }

    if (catalogDrawer.type === "option") {
      await handleCreateOption()
      return
    }

    if (catalogDrawer.type === "color") {
      if (catalogDrawer.mode === "create") {
        await handleCreateColor()
        return
      }
      if (!catalogDrawer.id) return
      const ok = await updateCatalogRow("product_colors", catalogDrawer.id, {
        category_id: newColor.category_id || null,
        name: newColor.name.trim(),
        hex: newColor.hex.toUpperCase(),
      })
      if (ok) setCatalogDrawer(null)
    }

    if (catalogDrawer.type === "modelColors") {
      setCatalogDrawer(null)
    }
  }

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: companyData, error: companyError }, { data: members, error: membersError }] = await Promise.all([
        (supabase.from("companies") as any).select("*").eq("id", currentUser.companyId).single(),
        (supabase.from("users") as any)
          .select("*")
          .eq("company_id", currentUser.companyId)
          .order("created_at", { ascending: true }),
      ])

      if (companyError) throw companyError
      if (membersError) throw membersError

      const settings = (companyData?.settings && typeof companyData.settings === "object" ? companyData.settings : {}) as CompanySettings
      setCompany({
        id: companyData?.id || currentUser.companyId,
        name: companyData?.name || "",
        slug: companyData?.slug || "",
        logo_url: companyData?.logo_url || "",
        phone: settings.phone || "",
        email: settings.email || "",
        address: settings.address || "",
        warranty_template: settings.warranty_template || "",
        settings,
      })
      setTeam((members || []) as TeamMember[])
      await loadCatalogData()
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar configurações")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!catalogCategories.length) return
    if (!selectedCategoryId || !catalogCategories.some((category) => category.id === selectedCategoryId)) {
      const nextCategory = catalogCategories.find(isActiveCatalogRow) || catalogCategories[0]
      setSelectedCategoryId(nextCategory.id)
      setAttributeCategoryId((current) => current || nextCategory.id)
    }
  }, [catalogCategories, selectedCategoryId])

  useEffect(() => {
    if (!selectedCategorySubcategories.length) {
      setSelectedSubcategoryId("")
      return
    }
    if (!selectedSubcategoryId || !selectedCategorySubcategories.some((subcategory) => subcategory.id === selectedSubcategoryId)) {
      const nextSubcategory = selectedCategorySubcategories.find(isActiveCatalogRow) || selectedCategorySubcategories[0]
      setSelectedSubcategoryId(nextSubcategory.id)
    }
  }, [selectedCategorySubcategories, selectedSubcategoryId])

  async function loadCatalogData() {
    setCatalogLoading(true)
    try {
      const [categories, subcategories, attributes, options, colors, subcategoryColors, warrantyPoliciesResponse] = await Promise.all([
        (supabase.from("product_categories") as any).select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
        (supabase.from("product_subcategories") as any).select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
        (supabase.from("product_attributes") as any).select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
        (supabase.from("product_attribute_options") as any).select("*").order("sort_order", { ascending: true }).order("label", { ascending: true }),
        (supabase.from("product_colors") as any).select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
        (supabase.from("product_subcategory_colors") as any).select("*").order("sort_order", { ascending: true }),
        fetch("/api/warranty/selectable-policies").then((res) => (res.ok ? res.json() : { data: [] })).catch(() => ({ data: [] })),
      ])

      if (categories.error) throw categories.error
      if (subcategories.error) throw subcategories.error
      if (attributes.error) throw attributes.error
      if (options.error) throw options.error
      if (colors.error) throw colors.error
      if (subcategoryColors.error) throw subcategoryColors.error

      setCatalogCategories((categories.data || []) as CatalogCategoryRow[])
      setCatalogSubcategories((subcategories.data || []) as CatalogSubcategoryRow[])
      setCatalogAttributes((attributes.data || []) as CatalogAttributeRow[])
      setCatalogAttributeOptions((options.data || []) as CatalogAttributeOptionRow[])
      setCatalogColors((colors.data || []) as CatalogColorRow[])
      setCatalogSubcategoryColors((subcategoryColors.data || []) as CatalogSubcategoryColorRow[])
      setWarrantyPolicyOptions(Array.isArray(warrantyPoliciesResponse?.data) ? warrantyPoliciesResponse.data : [])
    } catch (error: any) {
      if (String(error?.message || "").includes("does not exist")) return
      toast.error(error?.message || "Erro ao carregar catálogo")
    } finally {
      setCatalogLoading(false)
    }
  }

  function updateCompanyField<K extends keyof CompanyForm>(field: K, value: CompanyForm[K]) {
    setCompany((current) => ({ ...current, [field]: value }))
  }

  async function handleSaveCompany() {
    if (!canEditSettings) {
      toast.error("Apenas owner pode alterar dados da empresa.")
      return
    }

    setSaving(true)
    try {
      const nextSettings = {
        ...(company.settings || {}),
        phone: company.phone,
        email: company.email,
        address: company.address,
        warranty_template: company.warranty_template,
      }
      const { error } = await (supabase.from("companies") as any)
        .update({
          name: company.name.trim(),
          slug: company.slug.trim(),
          logo_url: company.logo_url.trim() || null,
          settings: nextSettings,
        })
        .eq("id", company.id)

      if (error) throw error
      setCompany((current) => ({ ...current, settings: nextSettings }))
      toast.success("Dados da empresa salvos.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar empresa")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateCategory() {
    if (!canEditSettings || !newCategory.name.trim()) return
    if (hasDuplicateName(catalogCategories.filter(isActiveCatalogRow), newCategory.name)) {
      toast.error("Já existe uma categoria ativa com esse nome.")
      return
    }
    setSaving(true)
    try {
      const { error } = await (supabase.from("product_categories") as any).insert({
        name: newCategory.name.trim(),
        slug: slugify(newCategory.name),
        normalized_name: normalizeCatalogName(newCategory.name),
        product_type: newCategory.product_type,
        sort_order: catalogCategories.length + 1,
      })
      if (error) throw error
      setNewCategory({ name: "", product_type: "device" })
      await loadCatalogData()
      toast.success("Categoria criada.")
      setCatalogDrawer(null)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar categoria")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateSubcategory() {
    if (!canEditSettings || !newSubcategory.category_id || !newSubcategory.name.trim()) return
    if (hasDuplicateName(catalogSubcategories.filter(isActiveCatalogRow), newSubcategory.name, { category_id: newSubcategory.category_id })) {
      toast.error("Já existe uma subcategoria ativa com esse nome nessa categoria.")
      return
    }
    setSaving(true)
    try {
      const { error } = await (supabase.from("product_subcategories") as any).insert({
        category_id: newSubcategory.category_id,
        name: newSubcategory.name.trim(),
        slug: slugify(newSubcategory.name),
        normalized_name: normalizeCatalogName(newSubcategory.name),
        default_warranty_policy_id: newSubcategory.default_warranty_policy_id || null,
      })
      if (error) throw error
      setNewSubcategory({ category_id: newSubcategory.category_id, name: "", default_warranty_policy_id: "" })
      await loadCatalogData()
      toast.success("Subcategoria criada.")
      setCatalogDrawer(null)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar subcategoria")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateAttribute() {
    if (!canEditSettings || !newAttribute.category_id || !newAttribute.name.trim()) return
    if (hasDuplicateName(catalogAttributes.filter(isActiveCatalogRow), newAttribute.name, { category_id: newAttribute.category_id })) {
      toast.error("Já existe um atributo ativo com esse nome nessa categoria.")
      return
    }
    setSaving(true)
    try {
      const { error } = await (supabase.from("product_attributes") as any).insert({
        category_id: newAttribute.category_id,
        name: newAttribute.name.trim(),
        slug: slugify(newAttribute.name),
        normalized_name: normalizeCatalogName(newAttribute.name),
        input_type: newAttribute.input_type,
      })
      if (error) throw error
      setNewAttribute({ category_id: newAttribute.category_id, name: "", input_type: "select" })
      await loadCatalogData()
      toast.success("Atributo criado.")
      setCatalogDrawer(null)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar atributo")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateOption() {
    if (!canEditSettings || !newOption.attribute_id || !newOption.label.trim()) return
    if (hasDuplicateName(catalogAttributeOptions.filter(isActiveCatalogRow), newOption.label, { attribute_id: newOption.attribute_id })) {
      toast.error("Já existe uma opção ativa com esse nome nesse atributo.")
      return
    }
    setSaving(true)
    try {
      const { error } = await (supabase.from("product_attribute_options") as any).insert({
        attribute_id: newOption.attribute_id,
        label: newOption.label.trim(),
        value: newOption.label.trim(),
        normalized_name: normalizeCatalogName(newOption.label),
      })
      if (error) throw error
      setNewOption({ attribute_id: newOption.attribute_id, label: "" })
      await loadCatalogData()
      toast.success("Opção criada.")
      setCatalogDrawer(null)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar opção")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateColor() {
    const nextName = newColor.name.trim()
    const nextHex = normalizeHexColorInput(newColor.hex)
    const nextCategoryId = newColor.category_id || ""
    if (!canEditSettings || !nextName || !isValidHexColor(nextHex)) return
    const existingColor = catalogColors.find((color) => (color.category_id || "") === nextCategoryId && normalizeCatalogName(color.name) === normalizeCatalogName(nextName))
    if (existingColor && isActiveCatalogRow(existingColor)) {
      toast.error("Já existe uma cor ativa com esse nome nessa categoria.")
      return
    }
    setSaving(true)
    try {
      if (existingColor) {
        await enableGlobalColor(existingColor.id, { name: nextName, hex: nextHex })
        setNewColor({ category_id: newColor.category_id, name: "", hex: "#111827" })
        await loadCatalogData()
        toast.success("Cor inativa reativada e atualizada.")
        setCatalogDrawer(null)
        return
      }
      const { error } = await (supabase.from("product_colors") as any).insert({
        category_id: nextCategoryId || null,
        name: nextName,
        normalized_name: normalizeCatalogName(nextName),
        hex: nextHex,
      })
      if (error) throw error
      setNewColor({ category_id: newColor.category_id, name: "", hex: "#111827" })
      await loadCatalogData()
      toast.success("Cor criada.")
      setCatalogDrawer(null)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar cor")
    } finally {
      setSaving(false)
    }
  }

  async function linkColorToModel(subcategoryId: string, colorId: string) {
    if (!canEditSettings || !subcategoryId || !colorId) return
    const existing = catalogSubcategoryColors.find((item) => item.subcategory_id === subcategoryId && item.color_id === colorId)
    setSaving(true)
    try {
      if (existing?.id) {
        const { error } = await (supabase.from("product_subcategory_colors") as any)
          .update({ is_active: true, deleted_at: null })
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await (supabase.from("product_subcategory_colors") as any)
          .insert({ subcategory_id: subcategoryId, color_id: colorId, is_active: true })
        if (error) throw error
      }
      await loadCatalogData()
      toast.success("Cor vinculada ao modelo.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao vincular cor ao modelo")
    } finally {
      setSaving(false)
    }
  }

  async function enableGlobalColor(colorId: string, values: Partial<Pick<CatalogColorRow, "name" | "hex">> = {}) {
    if (!canEditSettings || !colorId) return
    const updateValues: Record<string, unknown> = {
      is_active: true,
      deleted_at: null,
    }
    if (values.name?.trim()) {
      updateValues.name = values.name.trim()
      updateValues.normalized_name = normalizeCatalogName(values.name)
    }
    if (values.hex && isValidHexColor(values.hex)) {
      updateValues.hex = values.hex
    }

    const { error } = await (supabase.from("product_colors") as any)
      .update(updateValues)
      .eq("id", colorId)
    if (error) throw error
  }

  async function handleEnableGlobalColor(colorId: string) {
    if (!canEditSettings || !colorId) return
    setSaving(true)
    try {
      await enableGlobalColor(colorId)
      await loadCatalogData()
      toast.success("Cor habilitada novamente.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao habilitar cor")
    } finally {
      setSaving(false)
    }
  }

  async function unlinkColorFromModel(subcategoryId: string, colorId: string) {
    if (!canEditSettings || !subcategoryId || !colorId) return
    const existing = catalogSubcategoryColors.find((item) => item.subcategory_id === subcategoryId && item.color_id === colorId)
    if (!existing?.id) return
    setSaving(true)
    try {
      const { error } = await (supabase.from("product_subcategory_colors") as any)
        .update({ is_active: false })
        .eq("id", existing.id)
      if (error) throw error
      await loadCatalogData()
      toast.success("Cor removida do modelo. A cor global foi mantida.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao remover vínculo da cor")
    } finally {
      setSaving(false)
    }
  }

  async function createColorForSelectedModel() {
    if (!canEditSettings || !selectedCategory || !selectedSubcategory || !newModelColor.name.trim() || !newModelColorHexValid) return
    const nextName = newModelColor.name.trim()
    const nextHex = normalizeHexColorInput(newModelColor.hex)
    const existing = selectedCategoryColors.find((color) => normalizeCatalogName(color.name) === normalizeCatalogName(nextName))
    setSaving(true)
    try {
      let colorId = existing?.id || ""
      if (colorId) {
        if (existing && !isActiveCatalogRow(existing)) {
          await enableGlobalColor(colorId, { name: nextName, hex: nextHex })
        }
      } else {
        const { data, error } = await (supabase.from("product_colors") as any)
          .insert({
            category_id: selectedCategory.id,
            name: nextName,
            normalized_name: normalizeCatalogName(nextName),
            hex: nextHex,
          })
          .select("*")
          .single()
        if (error) throw error
        colorId = data?.id || ""
      }
      if (colorId) {
        const existingLink = catalogSubcategoryColors.find((item) => item.subcategory_id === selectedSubcategory.id && item.color_id === colorId)
        if (existingLink?.id) {
          const { error } = await (supabase.from("product_subcategory_colors") as any)
            .update({ is_active: true, deleted_at: null })
            .eq("id", existingLink.id)
          if (error) throw error
        } else {
          const { error } = await (supabase.from("product_subcategory_colors") as any)
            .insert({ subcategory_id: selectedSubcategory.id, color_id: colorId, is_active: true })
          if (error) throw error
        }
      }
      setNewModelColor({ name: "", hex: "#111827" })
      await loadCatalogData()
      toast.success(existing ? "Cor existente vinculada ao modelo." : "Cor criada e vinculada ao modelo.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar cor para o modelo")
    } finally {
      setSaving(false)
    }
  }

  async function updateCatalogRow(table: string, id: string, values: Record<string, unknown>) {
    if (!canEditSettings) return false
    const nextName = String(values.name || values.label || "").trim()
    if (nextName) {
      if (table === "product_categories" && hasDuplicateName(catalogCategories.filter(isActiveCatalogRow), nextName, {}, id)) {
        toast.error("Já existe uma categoria ativa com esse nome.")
        return false
      }
      const subcategory = catalogSubcategories.find((item) => item.id === id)
      if (table === "product_subcategories" && subcategory && hasDuplicateName(catalogSubcategories.filter(isActiveCatalogRow), nextName, { category_id: String(values.category_id || subcategory.category_id) }, id)) {
        toast.error("Já existe uma subcategoria ativa com esse nome nessa categoria.")
        return false
      }
      const attribute = catalogAttributes.find((item) => item.id === id)
      if (table === "product_attributes" && attribute && hasDuplicateName(catalogAttributes.filter(isActiveCatalogRow), nextName, { category_id: String(values.category_id || attribute.category_id) }, id)) {
        toast.error("Já existe um atributo ativo com esse nome nessa categoria.")
        return false
      }
      const option = catalogAttributeOptions.find((item) => item.id === id)
      if (table === "product_attribute_options" && option && hasDuplicateName(catalogAttributeOptions.filter(isActiveCatalogRow), nextName, { attribute_id: option.attribute_id }, id)) {
        toast.error("Já existe uma opção ativa com esse nome nesse atributo.")
        return false
      }
      const color = catalogColors.find((item) => item.id === id)
      const colorCategoryId = String(values.category_id || color?.category_id || "")
      if (table === "product_colors" && color && hasDuplicateName(catalogColors.filter((item) => isActiveCatalogRow(item) && (item.category_id || "") === colorCategoryId), nextName, {}, id)) {
        toast.error("Já existe uma cor ativa com esse nome nessa categoria.")
        return false
      }
      values.normalized_name = normalizeCatalogName(nextName)
    }
    setSaving(true)
    try {
      const { error } = await (supabase.from(table) as any).update(values).eq("id", id)
      if (error) throw error
      await loadCatalogData()
      toast.success("Catálogo atualizado.")
      return true
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar catálogo")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function getCatalogUsageMessage(table: string, id: string) {
    if (table === "product_categories") {
      const category = catalogCategories.find((item) => item.id === id)
      if (!category) return null
      const legacyKey = category.legacy_key || category.slug
      const [{ data: catalogRows }, activeChildren] = await Promise.all([
        (supabase.from("product_catalog") as any).select("id").eq("category", legacyKey).limit(1),
        Promise.resolve(catalogSubcategories.some((item) => item.category_id === id && isActiveCatalogRow(item))),
      ])
      return catalogRows?.length || activeChildren ? "Este item está vinculado a produtos existentes e foi apenas desativado para novos cadastros." : null
    }
    if (table === "product_subcategories") {
      const subcategory = catalogSubcategories.find((item) => item.id === id)
      const category = subcategory ? categoryById.get(subcategory.category_id) : null
      if (!subcategory) return null
      const { data } = await (supabase.from("product_catalog") as any)
        .select("id")
        .eq("category", category?.legacy_key || category?.slug || "")
        .eq("model", subcategory.legacy_model || subcategory.name)
        .limit(1)
      return data?.length ? "Este item está vinculado a produtos existentes e foi apenas desativado para novos cadastros." : null
    }
    if (table === "product_colors") {
      const color = catalogColors.find((item) => item.id === id)
      const category = color?.category_id ? categoryById.get(color.category_id) : null
      if (!color) return null
      let query = (supabase.from("product_catalog") as any)
        .select("id")
        .eq("color", color.name)
        .limit(1)
      if (category) query = query.eq("category", category.legacy_key || category.slug)
      const { data } = await query
      return data?.length ? "Este item está vinculado a produtos existentes e foi apenas desativado para novos cadastros." : null
    }
    if (table === "product_attributes") {
      const hasOptions = catalogAttributeOptions.some((option) => option.attribute_id === id && isActiveCatalogRow(option))
      return hasOptions ? "Este item possui opções vinculadas e foi apenas desativado para novos cadastros." : null
    }
    if (table === "product_attribute_options") {
      const option = catalogAttributeOptions.find((item) => item.id === id)
      const attribute = option ? attributeById.get(option.attribute_id) : null
      if (!option || !attribute) return null
      const category = categoryById.get(attribute.category_id)
      const column = ["armazenamento", "capacidade", "storage"].includes(attribute.slug) ? "storage" : null
      if (!column) return null
      const { data } = await (supabase.from("product_catalog") as any)
        .select("id")
        .eq("category", category?.legacy_key || category?.slug || "")
        .eq(column, option.value || option.label)
        .limit(1)
      return data?.length ? "Este item está vinculado a produtos existentes e foi apenas desativado para novos cadastros." : null
    }
    return null
  }

  async function deleteCatalogRow(table: string, id: string) {
    if (!canEditSettings) return
    setSaving(true)
    try {
      const usageMessage = await getCatalogUsageMessage(table, id)
      const { error } = await (supabase.from(table) as any)
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await loadCatalogData()
      toast.success(usageMessage || "Item desativado para novos cadastros.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao desativar item")
    } finally {
      setSaving(false)
    }
  }

  async function refreshTeam() {
    const { data, error } = await (supabase.from("users") as any)
      .select("*")
      .eq("company_id", currentUser.companyId)
      .order("created_at", { ascending: true })
    if (error) throw error
    setTeam((data || []) as TeamMember[])
  }

  async function handleCreateMember() {
    if (!canManageTeam) {
      toast.error("Apenas owner pode criar usuários internos.")
      return
    }
    if (!newMember.email.includes("@") || !newMember.full_name.trim()) {
      toast.error("Informe nome e e-mail válidos.")
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase.from("users") as any).insert({
        full_name: newMember.full_name.trim(),
        email: newMember.email.trim().toLowerCase(),
        role: newMember.role,
        status: "active",
      })
      if (error) throw error
      setNewMember({ full_name: "", email: "", role: "operator" })
      await refreshTeam()
      toast.success("Usuário interno criado.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar usuário")
    } finally {
      setSaving(false)
    }
  }

  function startEditMember(member: TeamMember) {
    setEditingMemberId(member.id)
    setEditingMember({ full_name: member.full_name || "", role: member.role })
  }

  async function handleSaveMember(memberId: string) {
    if (!canManageTeam) {
      toast.error("Apenas owner pode editar equipe.")
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase.from("users") as any)
        .update({
          full_name: editingMember.full_name.trim(),
          role: editingMember.role,
        })
        .eq("id", memberId)
      if (error) throw error
      setEditingMemberId(null)
      await refreshTeam()
      toast.success("Usuário atualizado.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar usuário")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleMemberStatus(member: TeamMember) {
    if (!canManageTeam) {
      toast.error("Apenas owner pode ativar ou inativar usuários.")
      return
    }
    if (member.id === currentUser.id) {
      toast.error("Você não pode inativar o próprio usuário logado.")
      return
    }

    const nextStatus = (member.status || "active") === "active" ? "inactive" : "active"
    setSaving(true)
    try {
      const { error } = await (supabase.from("users") as any)
        .update({ status: nextStatus })
        .eq("id", member.id)
      if (error) throw error
      await refreshTeam()
      toast.success(nextStatus === "active" ? "Usuário reativado." : "Usuário inativado.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao alterar status")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Loader2 className="h-9 w-9 animate-spin text-royal-500" />
        <p className="text-sm font-medium">Carregando central administrativa...</p>
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden pb-12 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          {activeTab === "catalog" ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Configurações <span className="text-slate-400">/</span> Catálogo
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Gerencie categorias, subcategorias, atributos e cores do catálogo de produtos.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 font-syne">Configurações</h2>
              <p className="text-sm text-gray-500">Central administrativa da loja, equipe e permissões.</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
          {currentUser.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 font-bold text-white">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-navy-900">{currentUser.name}</p>
            <Badge variant={roleBadgeVariant[currentUser.role]}>{roleLabels[currentUser.role]}</Badge>
          </div>
        </div>
      </div>

      {!canEditSettings && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-100/40 p-4 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Seu perfil pode visualizar esta central, mas alterações críticas ficam bloqueadas no backend.</p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex min-w-fit items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                activeTab === tab.key
                  ? "bg-navy-900 text-white shadow-lg shadow-navy-900/20"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "company" && (
        <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-royal-100">
                <Building className="h-5 w-5 text-royal-600" />
              </div>
              <div>
                <h3 className="font-bold text-navy-900">Dados da Empresa</h3>
                <p className="text-xs text-gray-500">Informações usadas em documentos, garantia e atendimento.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/configuracoes/empresa"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-navy-900 px-3 text-xs font-bold text-white transition hover:bg-navy-800"
              >
                Central da empresa
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {!canEditSettings && <Badge variant="gray">Somente leitura</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Nome da Loja" value={company.name} disabled={!canEditSettings} onChange={(event) => updateCompanyField("name", event.target.value)} />
            <Input label="Slug interno" value={company.slug} disabled={!canEditSettings} onChange={(event) => updateCompanyField("slug", event.target.value)} />
            <Input label="WhatsApp / Telefone" value={company.phone} disabled={!canEditSettings} onChange={(event) => updateCompanyField("phone", formatPhone(event.target.value))} />
            <Input label="E-mail de Contato" type="email" value={company.email} disabled={!canEditSettings} onChange={(event) => updateCompanyField("email", event.target.value)} />
            <Input label="Logo da empresa (URL)" value={company.logo_url} disabled={!canEditSettings} onChange={(event) => updateCompanyField("logo_url", event.target.value)} />
            <Input label="Endereço Físico" value={company.address} disabled={!canEditSettings} onChange={(event) => updateCompanyField("address", event.target.value)} />
          </div>

          <Button onClick={handleSaveCompany} disabled={saving || !canEditSettings} className="shadow-lg shadow-royal-600/20">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar empresa
          </Button>
        </section>
      )}

      {activeTab === "catalog" && (
        <section className="w-full min-w-0 space-y-6 overflow-x-hidden">
          {!canEditSettings && (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Seu perfil pode visualizar o catálogo, mas alterações ficam restritas ao owner.</p>
            </div>
          )}

          {catalogLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white p-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-royal-500" />
              Carregando catálogo...
            </div>
          ) : null}

          <div className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-4">
            {catalogPanelTabs.map((tab) => (
              <CatalogTabButton
                key={tab.key}
                active={catalogPanelTab === tab.key}
                icon={tab.icon}
                label={tab.label}
                onClick={() => setCatalogPanelTab(tab.key)}
              />
            ))}
          </div>

          {catalogPanelTab === "categories" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <CatalogPanelCard
                className="xl:col-span-4"
                title="Categorias"
                description="Gerencie as categorias principais do catálogo."
                action={
                  <Button size="sm" className="h-9 rounded-xl" disabled={!canEditSettings} onClick={() => openCatalogDrawer({ type: "category", mode: "create" })}>
                    <Plus className="h-4 w-4" /> Nova categoria
                  </Button>
                }
              >
                <CatalogSearchInput value={categorySearch} onChange={setCategorySearch} placeholder="Buscar categoria..." />
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
                  <div className="grid grid-cols-[minmax(0,1fr)_86px_40px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                    <span>Categoria</span>
                    <span>Status</span>
                    <span />
                  </div>
                  <div className="max-h-[460px] overflow-y-auto pr-1">
                    {filteredCategories.length === 0 ? (
                      <CatalogEmptyState label="Nenhuma categoria encontrada." />
                    ) : filteredCategories.map((category) => {
                      const subcategoryCount = catalogSubcategories.filter((item) => item.category_id === category.id).length
                      const active = isActiveCatalogRow(category)
                      const selected = selectedCategory?.id === category.id
                      return (
                        <div key={category.id} className={cn("grid grid-cols-[minmax(0,1fr)_86px_40px] items-center border-t border-slate-100 px-3 py-3 transition", selected ? "bg-blue-50/60" : "bg-white hover:bg-slate-50")}>
                          <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setSelectedCategoryId(category.id)}>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                              <Folder className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-950">{category.name}</span>
                              <span className="block text-xs text-slate-500">{subcategoryCount} subcategorias</span>
                            </span>
                          </button>
                          <CatalogStatusBadge active={active} />
                          <CatalogActionMenu
                            disabled={!canEditSettings}
                            onEdit={() => openCatalogDrawer({ type: "category", mode: "edit", id: category.id })}
                            onDelete={() => deleteCatalogRow("product_categories", category.id)}
                            deleteLabel="Desativar"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-slate-500">{catalogCategories.length} categorias</p>
              </CatalogPanelCard>

              <CatalogPanelCard
                className="xl:col-span-4"
                title="Subcategorias"
                description="Subcategorias da categoria selecionada."
                action={
                  <Button size="sm" className="h-9 rounded-xl" disabled={!canEditSettings || !selectedCategory} onClick={() => openCatalogDrawer({ type: "subcategory", mode: "create" })}>
                    <Plus className="h-4 w-4" /> Nova subcategoria
                  </Button>
                }
              >
                <CatalogCategorySelect categories={catalogCategories} value={selectedCategory?.id || ""} disabled={!catalogCategories.length} onChange={(value) => setSelectedCategoryId(value)} compact />
                <div className="mt-3">
                  <CatalogSearchInput value={subcategorySearch} onChange={setSubcategorySearch} placeholder="Buscar subcategoria..." />
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
                  <div className="grid grid-cols-[minmax(0,1fr)_86px_40px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                    <span>Subcategoria</span>
                    <span>Status</span>
                    <span />
                  </div>
                  <div className="max-h-[460px] overflow-y-auto pr-1">
                    {filteredSubcategories.length === 0 ? (
                      <CatalogEmptyState label="Nenhuma subcategoria encontrada." />
                    ) : filteredSubcategories.map((subcategory) => (
                      <div key={subcategory.id} className={cn("grid grid-cols-[minmax(0,1fr)_86px_40px] items-center border-t border-slate-100 px-3 py-3 transition", selectedSubcategory?.id === subcategory.id ? "bg-blue-50/60" : "bg-white hover:bg-slate-50")}>
                        <button type="button" className="min-w-0 text-left" onClick={() => setSelectedSubcategoryId(subcategory.id)}>
                          <p className="truncate text-sm font-semibold text-slate-950">{subcategory.name}</p>
                          <p className="truncate text-xs text-slate-500">{selectedCategory?.name || "Categoria"}</p>
                        </button>
                        <CatalogStatusBadge active={isActiveCatalogRow(subcategory)} />
                        <CatalogActionMenu
                          disabled={!canEditSettings}
                          onEdit={() => openCatalogDrawer({ type: "subcategory", mode: "edit", id: subcategory.id })}
                          onDelete={() => deleteCatalogRow("product_subcategories", subcategory.id)}
                          deleteLabel="Desativar"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-slate-500">{selectedCategorySubcategories.length} subcategorias</p>
              </CatalogPanelCard>

              <CatalogPanelCard className="xl:col-span-4" title="Resumo da categoria" description="Visão geral da categoria selecionada.">
                {selectedCategory ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                          <Box className="h-8 w-8" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-bold text-slate-950">{selectedCategory.name}</h3>
                            <CatalogStatusBadge active={isActiveCatalogRow(selectedCategory)} />
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {selectedCategorySubcategories.length} subcategorias • {selectedCategoryAttributes.length} atributos • {selectedCategoryColors.length} cores
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <CatalogSummaryCounter label="Subcategorias" value={selectedCategorySubcategories.length} />
                      <CatalogSummaryCounter label="Atributos" value={selectedCategoryAttributes.length} />
                      <CatalogSummaryCounter label="Cores" value={selectedCategoryColors.length} />
                    </div>

                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-slate-950">Atributos</h4>
                        <button type="button" className="text-xs font-semibold text-blue-600 hover:text-blue-700" onClick={() => setCatalogPanelTab("attributes")}>Ver todos</button>
                      </div>
                      <div className="space-y-2">
                        {selectedCategoryAttributes.slice(0, 3).map((attribute) => (
                          <div key={attribute.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                            <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{attribute.name}</p>
                              <p className="text-xs text-slate-500">{(attributeOptionsByAttributeId.get(attribute.id) || []).length} opções</p>
                            </div>
                          </div>
                        ))}
                        {selectedCategoryAttributes.length === 0 ? <CatalogEmptyState label="Sem atributos nesta categoria." compact /> : null}
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-slate-950">
                            {selectedSubcategory ? `Cores do modelo ${selectedSubcategory.name}` : "Cores por modelo"}
                          </h4>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {selectedSubcategory ? "Somente estas cores aparecem no cadastro deste modelo." : "Selecione uma subcategoria para gerenciar cores permitidas."}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!selectedSubcategory}
                          className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-300"
                          onClick={() => selectedSubcategory && openCatalogDrawer({ type: "modelColors", mode: "manage", subcategoryId: selectedSubcategory.id })}
                        >
                          Gerenciar cores do modelo
                        </button>
                      </div>
                      {selectedCategorySubcategories.length > 0 ? (
                        <div className="mb-3">
                          <select
                            value={selectedSubcategory?.id || ""}
                            onChange={(event) => setSelectedSubcategoryId(event.target.value)}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20"
                          >
                            {selectedCategorySubcategories.map((subcategory) => (
                              <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      {selectedModelColors.length > 0 ? (
                        <div className="flex flex-wrap gap-3">
                          {selectedModelColors.slice(0, 10).map((color) => (
                            <span key={color.id} title={color.name} className="h-8 w-8 rounded-full border border-slate-200 shadow-inner" style={{ backgroundColor: color.hex }} />
                          ))}
                        </div>
                      ) : (
                        <CatalogEmptyState label={selectedSubcategory ? "Nenhuma cor configurada para este modelo." : "Nenhum modelo selecionado."} compact />
                      )}
                    </div>
                  </div>
                ) : (
                  <CatalogEmptyState label="Selecione uma categoria para ver o resumo." />
                )}
              </CatalogPanelCard>
            </div>
          )}

          {catalogPanelTab === "attributes" && (
            <CatalogPanelCard
              title="Atributos"
              description="Defina atributos e opções usados no cadastro de produtos."
              action={
                <Button size="sm" className="h-9 rounded-xl" disabled={!canEditSettings || !catalogCategories.length} onClick={() => openCatalogDrawer({ type: "attribute", mode: "create" })}>
                  <Plus className="h-4 w-4" /> Novo atributo
                </Button>
              }
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <CatalogCategorySelect
                  categories={catalogCategories}
                  value={attributeCategoryId || selectedCategory?.id || ""}
                  disabled={!catalogCategories.length}
                  onChange={(value) => {
                    setAttributeCategoryId(value)
                    setAttributeSubcategoryId("")
                  }}
                  compact
                />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-navy-900">Subcategoria</label>
                  <select
                    value={attributeSubcategoryId}
                    onChange={(event) => setAttributeSubcategoryId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20"
                  >
                    <option value="">Todas as subcategorias</option>
                    {attributeCategorySubcategories.map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-5 grid max-h-[620px] grid-cols-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
                {filteredAttributes.length === 0 ? (
                  <CatalogEmptyState label="Nenhum atributo encontrado." />
                ) : filteredAttributes.map((attribute) => {
                  const options = attributeOptionsByAttributeId.get(attribute.id) || []
                  return (
                    <div key={attribute.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-950">{attribute.name}</p>
                          <p className="text-xs text-slate-500">{categoryById.get(attribute.category_id)?.name || "Categoria"} • {attribute.input_type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <CatalogStatusBadge active={isActiveCatalogRow(attribute)} />
                          <CatalogActionMenu
                            disabled={!canEditSettings}
                            onEdit={() => openCatalogDrawer({ type: "attribute", mode: "edit", id: attribute.id })}
                            onDelete={() => deleteCatalogRow("product_attributes", attribute.id)}
                            deleteLabel="Desativar"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {options.length === 0 ? (
                          <span className="text-xs text-slate-500">Nenhuma opção cadastrada.</span>
                        ) : options.map((option) => (
                          <span key={option.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800">
                            {option.label}
                            <button disabled={!canEditSettings || !isActiveCatalogRow(option)} onClick={() => deleteCatalogRow("product_attribute_options", option.id)} className="text-slate-400 hover:text-red-500 disabled:opacity-40" title="Desativar opção">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <button type="button" disabled={!canEditSettings} onClick={() => openCatalogDrawer({ type: "option", mode: "create", attributeId: attribute.id })} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50">
                        <Plus className="h-3.5 w-3.5" /> Nova opção
                      </button>
                    </div>
                  )
                })}
              </div>
            </CatalogPanelCard>
          )}

          {catalogPanelTab === "colors" && (
            <CatalogPanelCard
              title="Cores"
              description="Controle nomes, HEX, vínculo de categoria e status das cores."
              action={
                <Button size="sm" className="h-9 rounded-xl" disabled={!canEditSettings} onClick={() => openCatalogDrawer({ type: "color", mode: "create" })}>
                  <Plus className="h-4 w-4" /> Nova cor
                </Button>
              }
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CatalogSearchInput className="w-full sm:flex-1" value={colorSearch} onChange={setColorSearch} placeholder="Buscar cor ou HEX..." />
                <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-500 sm:w-auto">
                  {(["active", "inactive", "all"] as CatalogColorFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setColorStatusFilter(filter)}
                      className={cn(
                        "h-8 rounded-lg px-3 transition",
                        colorStatusFilter === filter ? "bg-white text-blue-700 shadow-sm" : "hover:text-slate-900"
                      )}
                    >
                      {filter === "active" ? "Ativas" : filter === "inactive" ? "Inativas" : "Todas"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 grid max-h-[620px] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                {filteredColors.length === 0 ? (
                  <CatalogEmptyState label="Nenhuma cor encontrada." />
                ) : filteredColors.map((color) => (
                  <div key={color.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-11 w-11 shrink-0 rounded-full border border-slate-200 shadow-inner" style={{ backgroundColor: color.hex }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{color.name}</p>
                        <p className="text-xs font-medium text-slate-500">{color.hex}</p>
                        <p className="truncate text-xs text-slate-400">{color.category_id ? categoryById.get(color.category_id)?.name || "Categoria" : "Todas as categorias"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <CatalogStatusBadge active={isActiveCatalogRow(color)} />
                      <CatalogActionMenu
                        disabled={!canEditSettings}
                        onEdit={() => openCatalogDrawer({ type: "color", mode: "edit", id: color.id })}
                        onDelete={() => deleteCatalogRow("product_colors", color.id)}
                        onEnable={!isActiveCatalogRow(color) ? () => handleEnableGlobalColor(color.id) : undefined}
                        deleteLabel="Desativar"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CatalogPanelCard>
          )}

          {catalogPanelTab === "general" && (
            <CatalogPanelCard title="Geral" description="Informações de uso do catálogo configurável.">
              <div className="flex items-start gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                  <Grid2X2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Use o catálogo para organizar categorias, atributos, cores e variações usadas no cadastro de produtos.</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Novas configurações gerais podem entrar aqui sem poluir as listas operacionais.</p>
                </div>
              </div>
            </CatalogPanelCard>
          )}

          {catalogDrawer ? (
            <CatalogDrawer
              title={catalogDrawer.mode === "create" ? drawerCreateTitle(catalogDrawer.type) : drawerEditTitle(catalogDrawer.type)}
              description="Preencha os campos e salve para atualizar o catálogo."
              saving={saving}
              saveDisabled={!canEditSettings || catalogDrawerSaveDisabled(catalogDrawer, newCategory, newSubcategory, newAttribute, newOption, newColor)}
              onClose={() => setCatalogDrawer(null)}
              onSave={handleSaveCatalogDrawer}
            >
              {catalogDrawer.type === "category" ? (
                <div className="space-y-4">
                  <Input label="Nome" value={newCategory.name} disabled={!canEditSettings} placeholder="Ex: iPhone" onChange={(event) => setNewCategory((current) => ({ ...current, name: event.target.value }))} />
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-navy-900">Tipo</label>
                    <select
                      value={newCategory.product_type}
                      disabled={!canEditSettings}
                      onChange={(event) => setNewCategory((current) => ({ ...current, product_type: event.target.value as ProductType }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:opacity-50"
                    >
                      <option value="device">Aparelho</option>
                      <option value="accessory">Acessório</option>
                      <option value="service">Serviço</option>
                      <option value="warranty">Garantia</option>
                      <option value="bundle">Kit</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {catalogDrawer.type === "subcategory" ? (
                <div className="space-y-4">
                  <CatalogCategorySelect categories={catalogCategories} value={newSubcategory.category_id} disabled={!canEditSettings} onChange={(value) => setNewSubcategory((current) => ({ ...current, category_id: value }))} compact />
                  <Input label="Nome" value={newSubcategory.name} disabled={!canEditSettings} placeholder="Ex: iPhone 15 Pro Max" onChange={(event) => setNewSubcategory((current) => ({ ...current, name: event.target.value }))} />
                  {(() => {
                    const parentCategory = catalogCategories.find((cat) => cat.id === newSubcategory.category_id)
                    if (parentCategory?.product_type !== "accessory") return null
                    return (
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-navy-900">
                          Garantia padrão
                        </label>
                        <select
                          value={newSubcategory.default_warranty_policy_id}
                          disabled={!canEditSettings}
                          onChange={(event) =>
                            setNewSubcategory((current) => ({
                              ...current,
                              default_warranty_policy_id: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:opacity-50"
                        >
                          <option value="">Sem garantia contratual</option>
                          {warrantyPolicyOptions.map((policy) => (
                            <option key={policy.id} value={policy.id}>
                              {policy.selectionLabel || policy.name}
                              {policy.calculationMode === "calendar_months" && policy.defaultMonths ? ` — ${policy.defaultMonths} meses` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500">
                          Defina uma vez por subcategoria. A venda já sugere essa garantia e ainda permite ajuste manual por item.
                        </p>
                      </div>
                    )
                  })()}
                </div>
              ) : null}

              {catalogDrawer.type === "attribute" ? (
                <div className="space-y-4">
                  <CatalogCategorySelect categories={catalogCategories} value={newAttribute.category_id} disabled={!canEditSettings} onChange={(value) => setNewAttribute((current) => ({ ...current, category_id: value }))} compact />
                  <Input label="Nome" value={newAttribute.name} disabled={!canEditSettings} placeholder="Ex: Armazenamento" onChange={(event) => setNewAttribute((current) => ({ ...current, name: event.target.value }))} />
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-navy-900">Tipo de campo</label>
                    <select
                      value={newAttribute.input_type}
                      disabled={!canEditSettings}
                      onChange={(event) => setNewAttribute((current) => ({ ...current, input_type: event.target.value }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:opacity-50"
                    >
                      <option value="select">Seleção</option>
                      <option value="multi_select">Múltipla</option>
                      <option value="text">Texto</option>
                      <option value="number">Número</option>
                      <option value="boolean">Sim/Não</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {catalogDrawer.type === "option" ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-navy-900">Atributo</label>
                    <select
                      value={newOption.attribute_id}
                      disabled={!canEditSettings}
                      onChange={(event) => setNewOption((current) => ({ ...current, attribute_id: event.target.value }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:opacity-50"
                    >
                      <option value="">Selecione o atributo</option>
                      {catalogAttributes.map((attribute) => (
                        <option key={attribute.id} value={attribute.id}>{categoryById.get(attribute.category_id)?.name} · {attribute.name}</option>
                      ))}
                    </select>
                  </div>
                  <Input label="Opção" value={newOption.label} disabled={!canEditSettings} placeholder="Ex: 256GB" onChange={(event) => setNewOption((current) => ({ ...current, label: event.target.value }))} />
                </div>
              ) : null}

              {catalogDrawer.type === "color" ? (
                <div className="space-y-4">
                  <CatalogCategorySelect categories={catalogCategories} value={newColor.category_id} disabled={!canEditSettings} includeGlobal onChange={(value) => setNewColor((current) => ({ ...current, category_id: value }))} compact />
                  <Input label="Nome" value={newColor.name} disabled={!canEditSettings} placeholder="Ex: Titânio Natural" onChange={(event) => setNewColor((current) => ({ ...current, name: event.target.value }))} />
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-navy-900">Preview</label>
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(newColor.hex) ? newColor.hex : "#111827"}
                        disabled={!canEditSettings}
                        onChange={(event) => setNewColor((current) => ({ ...current, hex: event.target.value.toUpperCase() }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1 disabled:opacity-50"
                      />
                    </div>
                    <Input label="HEX" value={newColor.hex} disabled={!canEditSettings} onChange={(event) => setNewColor((current) => ({ ...current, hex: normalizeHexColorInput(event.target.value) }))} />
                  </div>
                  {existingNewCatalogColor ? (
                    <div className={cn(
                      "rounded-xl border p-3 text-xs font-medium",
                      isActiveCatalogRow(existingNewCatalogColor) ? "border-blue-100 bg-blue-50 text-blue-700" : "border-amber-100 bg-amber-50 text-amber-800"
                    )}>
                      {isActiveCatalogRow(existingNewCatalogColor)
                        ? "Já existe uma cor ativa com esse nome nessa categoria."
                        : "Já existe uma cor inativa com esse nome. Ao salvar, ela será reativada e o HEX será atualizado."}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_COLOR_SUGGESTIONS.slice(0, 10).map((color) => (
                      <button
                        key={`${color.name}-${color.hex}`}
                        type="button"
                        disabled={!canEditSettings}
                        onClick={() => setNewColor((current) => ({ ...current, name: color.name, hex: color.hex }))}
                        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-blue-300 disabled:opacity-50"
                      >
                        <span className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: color.hex }} />
                        {color.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {catalogDrawer.type === "modelColors" ? (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Modelo selecionado</p>
                    <p className="mt-1 text-lg font-bold text-slate-950">{selectedSubcategory?.name || "Modelo"}</p>
                    <p className="mt-1 text-sm text-blue-900/75">{selectedCategory?.name || "Categoria"} · remover vínculo não apaga a cor global.</p>
                  </div>

                  <div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-950">Cores do modelo</h4>
                        <p className="mt-0.5 text-xs text-slate-500">Filtre por status e vincule ou reative sem criar duplicidade.</p>
                      </div>
                      <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold">
                        {([
                          ["active", "Ativas"],
                          ["inactive", "Inativas"],
                          ["all", "Todas"],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setModelColorFilter(value)}
                            className={cn(
                              "rounded-lg px-3 py-1.5 transition",
                              modelColorFilter === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <CatalogSearchInput value={modelColorSearch} onChange={setModelColorSearch} placeholder="Buscar cor existente..." />
                    </div>
                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {modelColorRows.length === 0 ? (
                        <CatalogEmptyState label={modelColorFilter === "active" ? "Nenhuma cor ativa encontrada para este modelo." : "Nenhuma cor encontrada para este filtro."} compact />
                      ) : modelColorRows.map(({ color, link, colorActive, linkActive }) => {
                        const hasInactiveLink = Boolean(link && !linkActive)
                        const actionLabel = !colorActive
                          ? "Habilitar"
                          : linkActive
                            ? "Remover vínculo"
                            : hasInactiveLink
                              ? "Reativar vínculo"
                              : "Vincular"
                        return (
                          <div key={color.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="h-10 w-10 shrink-0 rounded-full border border-slate-200 shadow-inner" style={{ backgroundColor: color.hex }} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-950">{color.name}</p>
                                <p className="text-xs font-medium text-slate-500">{color.hex}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <CatalogStatusBadge active={colorActive} />
                                  <CatalogLinkStatusBadge status={linkActive ? "linked" : hasInactiveLink ? "inactive" : "unlinked"} />
                                </div>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant={linkActive ? "ghost" : "outline"}
                              size="sm"
                              disabled={!canEditSettings || saving || !selectedSubcategory}
                              className="h-9 w-full sm:w-auto"
                              onClick={async () => {
                                if (!selectedSubcategory) return
                                if (!colorActive) {
                                  setSaving(true)
                                  try {
                                    await enableGlobalColor(color.id)
                                    await loadCatalogData()
                                    toast.success("Cor global reativada.")
                                  } catch (error: any) {
                                    toast.error(error?.message || "Erro ao reativar cor")
                                  } finally {
                                    setSaving(false)
                                  }
                                  return
                                }
                                if (linkActive) {
                                  await unlinkColorFromModel(selectedSubcategory.id, color.id)
                                  return
                                }
                                await linkColorToModel(selectedSubcategory.id, color.id)
                              }}
                            >
                              {actionLabel}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h4 className="text-sm font-bold text-slate-950">Criar nova cor e vincular</h4>
                    {existingNewModelColor ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {isActiveCatalogRow(existingNewModelColor)
                          ? "Já existe uma cor ativa com esse nome. Vincule a cor existente em vez de criar duplicidade."
                          : "Já existe uma cor inativa com esse nome. Você pode reativar e atualizar o HEX informado."}
                      </div>
                    ) : null}
                    <div className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                      <Input label="Nome" value={newModelColor.name} disabled={!canEditSettings} placeholder="Ex: Cosmic Orange" onChange={(event) => setNewModelColor((current) => ({ ...current, name: event.target.value }))} />
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-navy-900">HEX</label>
                        <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
                          <input
                            type="color"
                            value={newModelColorHexValid ? newModelColor.hex : "#111827"}
                            disabled={!canEditSettings}
                            onChange={(event) => setNewModelColor((current) => ({ ...current, hex: event.target.value.toUpperCase() }))}
                            className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1 disabled:opacity-50"
                            aria-label="Selecionar cor"
                          />
                          <input
                            value={newModelColor.hex}
                            disabled={!canEditSettings}
                            placeholder="#D4845A"
                            onChange={(event) => setNewModelColor((current) => ({ ...current, hex: normalizeHexColorInput(event.target.value) }))}
                            className={cn(
                              "h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2",
                              newModelColorHexValid ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20" : "border-amber-300 focus:border-amber-500 focus:ring-amber-500/20"
                            )}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        disabled={!canEditSettings || saving || !newModelColor.name.trim() || !newModelColorHexValid || Boolean(existingNewModelColor && existingNewModelColorLink && isActiveCatalogRow(existingNewModelColor) && isActiveCatalogRow(existingNewModelColorLink))}
                        className="h-11 w-full whitespace-nowrap px-4 sm:w-auto"
                        onClick={createColorForSelectedModel}
                      >
                        {existingNewModelColor
                          ? isActiveCatalogRow(existingNewModelColor)
                            ? existingNewModelColorLink && isActiveCatalogRow(existingNewModelColorLink)
                              ? "Cor já vinculada"
                              : "Vincular cor existente"
                            : "Reativar e atualizar cor"
                          : "Criar e vincular"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CatalogDrawer>
          ) : null}
        </section>
      )}

      {activeTab === "team" && (
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Metric label="Usuários" value={team.length} />
            <Metric label="Ativos" value={activeMembers} />
            <Metric label="Perfil atual" value={roleLabels[currentUser.role]} />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-royal-100">
                <UserPlus className="h-5 w-5 text-royal-600" />
              </div>
              <div>
                <h3 className="font-bold text-navy-900">Novo usuário interno</h3>
                <p className="text-xs text-gray-500">O acesso ao Clerk ainda precisa existir com o mesmo e-mail.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
              <Input label="Nome" value={newMember.full_name} disabled={!canManageTeam} onChange={(event) => setNewMember((current) => ({ ...current, full_name: event.target.value }))} />
              <Input label="E-mail" type="email" value={newMember.email} disabled={!canManageTeam} onChange={(event) => setNewMember((current) => ({ ...current, email: event.target.value }))} />
              <RoleSelect value={newMember.role} disabled={!canManageTeam} onChange={(role) => setNewMember((current) => ({ ...current, role }))} />
              <Button onClick={handleCreateMember} disabled={saving || !canManageTeam} size="lg">
                <Mail className="h-4 w-4" />
                Criar
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-navy-900">Equipe atual</h3>
                <p className="text-xs text-gray-500">Exclusão física fica bloqueada por segurança; use inativação.</p>
              </div>
              {!canManageTeam && <Badge variant="gray">Gerenciamento bloqueado</Badge>}
            </div>

            {team.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Nenhum usuário interno encontrado para esta empresa.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-100">
                <div className="hidden grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr] gap-3 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 md:grid">
                  <span>Nome</span>
                  <span>E-mail</span>
                  <span>Cargo</span>
                  <span>Status</span>
                  <span>Criado em</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {team.map((member) => {
                    const editing = editingMemberId === member.id
                    const status = member.status || "active"
                    return (
                      <div key={member.id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr] md:items-center">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-sm font-bold text-white">
                            {memberInitial(member)}
                          </div>
                          {editing ? (
                            <Input value={editingMember.full_name} onChange={(event) => setEditingMember((current) => ({ ...current, full_name: event.target.value }))} />
                          ) : (
                            <p className="font-semibold text-navy-900">{member.full_name || "Sem nome"}</p>
                          )}
                        </div>
                        <p className="truncate text-sm text-gray-500">{member.email}</p>
                        {editing ? (
                          <RoleSelect value={editingMember.role} onChange={(role) => setEditingMember((current) => ({ ...current, role }))} />
                        ) : (
                          <Badge variant={roleBadgeVariant[member.role]}>{roleLabels[member.role]}</Badge>
                        )}
                        <Badge variant={status === "active" ? "green" : "gray"} dot>
                          {status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-500">{formatDate(member.created_at)}</span>
                          {canManageTeam && (
                            <div className="flex items-center gap-1">
                              {editing ? (
                                <button type="button" onClick={() => handleSaveMember(member.id)} className="rounded-lg p-2 text-success-600 hover:bg-success-100" aria-label="Salvar usuário">
                                  <Check className="h-4 w-4" />
                                </button>
                              ) : (
                                <button type="button" onClick={() => startEditMember(member)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Editar usuário">
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              <button type="button" onClick={() => handleToggleMemberStatus(member)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label="Alterar status">
                                <Ban className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "permissions" && (
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(["owner", "manager", "operator"] as UserRole[]).map((role) => (
              <div key={role} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <Badge variant={roleBadgeVariant[role]}>{roleLabels[role]}</Badge>
                <p className="mt-3 text-sm leading-6 text-gray-600">{roleDescriptions[role]}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">
              <span>Permissão</span>
              <span>Owner</span>
              <span>Manager</span>
              <span>Operator</span>
            </div>
            {permissionRows.map((row) => (
              <div key={row.permission} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 border-t border-gray-100 px-4 py-3 text-sm">
                <span className="font-medium text-navy-900">{row.label}</span>
                {(["owner", "manager", "operator"] as UserRole[]).map((role) => (
                  <span key={role} className={rolePermissions[role].includes(row.permission) ? "text-success-600" : "text-gray-300"}>
                    {rolePermissions[role].includes(row.permission) ? "Sim" : "Não"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "warranty" && (
        <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning-100">
              <FileText className="h-5 w-5 text-warning-600" />
            </div>
            <div>
              <h3 className="font-bold text-navy-900">Termos e Garantias</h3>
              <p className="text-xs text-gray-500">Texto padrão usado nos documentos de venda.</p>
            </div>
          </div>
          <Textarea
            rows={7}
            label="Texto Padrão de Garantia"
            value={company.warranty_template}
            disabled={!canEditSettings}
            onChange={(event) => updateCompanyField("warranty_template", event.target.value)}
          />
          <Button onClick={handleSaveCompany} disabled={saving || !canEditSettings}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar garantia
          </Button>
        </section>
      )}

      {activeTab === "finance" && (
        <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-navy-900">Módulo Financeiro</h3>
              <p className="text-xs text-gray-500">Atalhos respeitam o perfil do usuário logado.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FinanceLink href="/financeiro" title="Painel Financeiro" description="Caixa, conciliação e fluxo de recebíveis" allowed={canAccess(currentUser.role, "finance.view")} />
            <FinanceLink href="/financeiro/taxas" title="Taxas da Maquininha" description="Margens e taxas críticas de venda" allowed={canAccess(currentUser.role, "finance.tax_settings")} />
            <FinanceLink href="/financeiro/dre" title="DRE" description="Resultado gerencial mensalizado" allowed={canAccess(currentUser.role, "finance.dre")} />
            <FinanceLink href="/financeiro/transacoes" title="Entradas e Saídas" description="Lançamentos financeiros operacionais" allowed={canAccess(currentUser.role, "finance.view")} />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-royal-100 bg-royal-50 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-royal-500" />
            <p className="text-xs leading-relaxed text-royal-700">
              Botões escondidos ajudam a UX, mas as mesmas permissões também são validadas no `/api/db`.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-navy-900">{value}</p>
    </div>
  )
}

function RoleSelect({ value, onChange, disabled = false }: { value: UserRole; onChange: (role: UserRole) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-navy-900">Cargo</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as UserRole)}
        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:pointer-events-none disabled:opacity-50"
      >
        <option value="owner">Owner</option>
        <option value="manager">Manager</option>
        <option value="operator">Operator</option>
      </select>
    </div>
  )
}

function CatalogCategorySelect({
  categories,
  value,
  onChange,
  disabled = false,
  includeGlobal = false,
  compact = false,
}: {
  categories: CatalogCategoryRow[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  includeGlobal?: boolean
  compact?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-navy-900">Categoria</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:pointer-events-none disabled:opacity-50",
          compact ? "h-10" : "h-11"
        )}
      >
        {includeGlobal ? <option value="">Todas as categorias</option> : <option value="">Selecione</option>}
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </select>
    </div>
  )
}

function drawerCreateTitle(type: CatalogDrawerState["type"]) {
  const titles: Record<CatalogDrawerState["type"], string> = {
    category: "Nova categoria",
    subcategory: "Nova subcategoria",
    attribute: "Novo atributo",
    option: "Nova opção",
    color: "Nova cor",
    modelColors: "Gerenciar cores do modelo",
  }
  return titles[type]
}

function drawerEditTitle(type: CatalogDrawerState["type"]) {
  const titles: Record<CatalogDrawerState["type"], string> = {
    category: "Editar categoria",
    subcategory: "Editar subcategoria",
    attribute: "Editar atributo",
    option: "Editar opção",
    color: "Editar cor",
    modelColors: "Gerenciar cores do modelo",
  }
  return titles[type]
}

function catalogDrawerSaveDisabled(
  drawer: CatalogDrawerState,
  category: { name: string },
  subcategory: { category_id: string; name: string },
  attribute: { category_id: string; name: string },
  option: { attribute_id: string; label: string },
  color: { name: string; hex: string }
) {
  if (drawer.type === "category") return !category.name.trim()
  if (drawer.type === "subcategory") return !subcategory.category_id || !subcategory.name.trim()
  if (drawer.type === "attribute") return !attribute.category_id || !attribute.name.trim()
  if (drawer.type === "option") return !option.attribute_id || !option.label.trim()
  if (drawer.type === "color") return !color.name.trim() || !/^#[0-9a-f]{6}$/i.test(color.hex)
  if (drawer.type === "modelColors") return false
  return false
}

function CatalogPanelCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string
  description: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function CatalogTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-14 min-w-0 items-center justify-center gap-2 border-b-2 px-3 text-sm font-medium transition",
        active ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function CatalogSearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
  )
}

function CatalogStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold", active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600")}>
      {active ? "Ativa" : "Inativa"}
    </span>
  )
}

function CatalogLinkStatusBadge({ status }: { status: "linked" | "inactive" | "unlinked" }) {
  const labels = {
    linked: "Vinculada",
    inactive: "Vínculo inativo",
    unlinked: "Não vinculada",
  }
  return (
    <span className={cn(
      "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold",
      status === "linked" ? "bg-blue-100 text-blue-700" : status === "inactive" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
    )}>
      {labels[status]}
    </span>
  )
}

function CatalogActionMenu({
  disabled,
  onEdit,
  onDelete,
  onEnable,
  deleteLabel,
}: {
  disabled?: boolean
  onEdit: () => void
  onDelete: () => void
  onEnable?: () => void
  deleteLabel: string
}) {
  return (
    <details className="group relative">
      <summary className={cn("flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", disabled && "pointer-events-none opacity-40")}>
        <MoreVertical className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg">
        <button type="button" onClick={onEdit} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-50">
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        {onEnable ? (
          <button type="button" onClick={onEnable} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-emerald-700 hover:bg-emerald-50">
            <Check className="h-3.5 w-3.5" /> Habilitar
          </button>
        ) : (
          <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">
            <X className="h-3.5 w-3.5" /> {deleteLabel}
          </button>
        )}
      </div>
    </details>
  )
}

function CatalogSummaryCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
      <p className="text-lg font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  )
}

function CatalogEmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-slate-200 text-center text-sm text-slate-500", compact ? "p-4" : "p-6")}>
      {label}
    </div>
  )
}

function CatalogDrawer({
  title,
  description,
  saving,
  saveDisabled,
  onClose,
  onSave,
  children,
}: {
  title: string
  description: string
  saving: boolean
  saveDisabled: boolean
  onClose: () => void
  onSave: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/45 px-3 py-3 backdrop-blur-sm sm:items-stretch sm:justify-end sm:p-0">
      <button type="button" aria-label="Fechar painel" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-l-3xl sm:rounded-tr-none">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-950">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-5">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saveDisabled || saving} onClick={onSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </aside>
    </div>
  )
}

function FinanceLink({ href, title, description, allowed }: { href: string; title: string; description: string; allowed: boolean }) {
  if (!allowed) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 opacity-70">
        <div>
          <p className="font-bold text-navy-900">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <Lock className="h-4 w-4 text-gray-400" />
      </div>
    )
  }

  return (
    <Link href={href} className="group flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-royal-200 hover:bg-white">
      <div>
        <p className="font-bold text-navy-900">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-300 transition group-hover:text-royal-500" />
    </Link>
  )
}
