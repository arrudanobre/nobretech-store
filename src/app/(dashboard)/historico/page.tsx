"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toaster"
import { CHECKLIST_TEMPLATES } from "@/lib/constants"
import { formatDate, getProductName, renderChecklistHTML } from "@/lib/helpers"
import { generateWarrantyPDF, type SaleDocumentData } from "@/lib/sale-documents"
import { supabase } from "@/lib/supabase"
import {
  ArrowDownToLine,
  BadgeCheck,
  Check,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardPlus,
  Eye,
  FileCheck2,
  FileQuestion,
  FileText,
  Loader2,
  Package,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react"

type TabKey = "all" | "with_report" | "without_report" | "warranties" | "sold"
type LoadingAction = { id: string; type: "report" | "warranty" } | null
type ReportTableName = "inventory" | "checklists" | "sales" | "warranties"
type ReportQueryResult<T> = { data: T[] | null; error: { message?: string } | null }
type ReportQuery<T> = {
  select: (columns: string) => {
    order: (column: string, options?: { ascending?: boolean }) => Promise<ReportQueryResult<T>>
  }
}
type ReportInsertResult<T> = { data: T | null; error: { message?: string } | null }
type ReportInsertQuery<TValues, TResult> = {
  insert: (values: TValues) => {
    select: (columns: string) => {
      single: () => Promise<ReportInsertResult<TResult>>
    }
  }
}
type ReportUpdateQuery<TValues> = {
  update: (values: TValues) => {
    eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>
  }
}
type ChecklistStatus = "ok" | "fail" | "na"
type ChecklistDraftItem = { id: string; label: string; status: ChecklistStatus; note?: string }

interface ChecklistRecord {
  id: string
  inventory_id: string | null
  items: Array<{ id?: string; label?: string; status: string; note?: string }> | null
  completed_at: string | null
  created_at: string | null
  pdf_url: string | null
  device_type: string | null
}

interface SaleRecord {
  id: string
  inventory_id: string
  customer_id: string | null
  sale_date: string
  warranty_months: number | null
  warranty_start: string | null
  warranty_end: string | null
  warranty_pdf_url: string | null
  sale_status?: string | null
  payment_method: string | null
  sale_price: number | null
  notes: string | null
  customers?: {
    id: string
    full_name: string | null
    cpf: string | null
    phone: string | null
    email: string | null
  } | null
}

interface WarrantyRecord {
  id: string
  sale_id: string | null
  inventory_id: string | null
  customer_id: string | null
  start_date: string
  end_date: string
  status: string | null
  pdf_url: string | null
  notes: string | null
  customers?: {
    id: string
    full_name: string | null
    cpf: string | null
    phone: string | null
    email: string | null
  } | null
}

interface ReportDevice {
  id: string
  company_id: string
  catalog_id: string | null
  imei: string | null
  imei2: string | null
  serial_number: string | null
  grade: string | null
  status: string | null
  purchase_date: string | null
  created_at: string | null
  checklist_id: string | null
  battery_health: number | null
  ios_version: string | null
  condition_notes: string | null
  notes: string | null
  type: string | null
  photos: string[] | null
  product_catalog?: {
    id: string
    model: string | null
    variant: string | null
    storage: string | null
    color: string | null
    category: string | null
    brand: string | null
  } | null
  checklist?: ChecklistRecord | null
  sale?: SaleRecord | null
  warranty?: WarrantyRecord | null
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "with_report", label: "Com laudo" },
  { key: "without_report", label: "Sem laudo" },
  { key: "warranties", label: "Garantias" },
  { key: "sold", label: "Vendidos" },
]

function reportTable<T>(table: ReportTableName) {
  return supabase.from(table) as unknown as ReportQuery<T>
}

function insertReportTable<TValues, TResult>(table: ReportTableName) {
  return supabase.from(table) as unknown as ReportInsertQuery<TValues, TResult>
}

function updateReportTable<TValues>(table: ReportTableName) {
  return supabase.from(table) as unknown as ReportUpdateQuery<TValues>
}

function compact<T>(items: Array<T | null | undefined>) {
  return items.filter(Boolean) as T[]
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível montar a central operacional."
}

function productName(device: ReportDevice) {
  const resolved = getProductName({
    catalog: device.product_catalog
      ? {
          model: device.product_catalog.model || undefined,
          storage: device.product_catalog.storage || device.product_catalog.variant || undefined,
          color: device.product_catalog.color || undefined,
        }
      : null,
    condition_notes: device.condition_notes,
    notes: device.notes,
  })
  return ["Produto", "Produto sem nome"].includes(resolved) ? "Aparelho sem nome" : resolved
}

function productDetails(device: ReportDevice) {
  return compact([device.product_catalog?.storage, device.product_catalog?.color, device.grade ? `Grade ${device.grade}` : null]).join(" · ")
}

function lastDigits(value?: string | null) {
  if (!value) return null
  const clean = value.replace(/\s/g, "")
  return clean.slice(-4)
}

function maskedIdentity(device: ReportDevice) {
  const imei = lastDigits(device.imei)
  if (imei) return `IMEI final ${imei}`
  const serial = lastDigits(device.serial_number)
  if (serial) return `Serial final ${serial}`
  return "Identificador não informado"
}

function reportDate(device: ReportDevice) {
  return device.checklist?.completed_at || device.checklist?.created_at || null
}

function hasReport(device: ReportDevice) {
  return Boolean(device.checklist || device.checklist_id)
}

function isSealedDevice(device: ReportDevice) {
  return String(device.grade || "").trim().toLowerCase() === "lacrado"
}

function hasOperationalIdentity(device: ReportDevice) {
  return productName(device) !== "Aparelho sem nome" && Boolean(device.imei || device.imei2 || device.serial_number || device.product_catalog?.model)
}

function isSeminovoReportDevice(device: ReportDevice) {
  return device.type !== "supplier" && !isSealedDevice(device) && hasOperationalIdentity(device)
}

function hasWarranty(device: ReportDevice) {
  return Boolean(device.warranty || device.sale?.warranty_pdf_url || Number(device.sale?.warranty_months || 0) > 0)
}

function isSold(device: ReportDevice) {
  return device.status === "sold" || (device.sale && device.sale.sale_status !== "cancelled")
}

function isPendingReview(device: ReportDevice) {
  return device.status === "pending" || device.status === "under_repair"
}

function statusMeta(status?: string | null) {
  const map: Record<string, string> = {
    pending: "Pendente",
    active: "Em estoque",
    in_stock: "Em estoque",
    reserved: "Reservado",
    sold: "Vendido",
    returned: "Devolvido",
    under_repair: "Em revisão",
    trade_in_received: "Troca recebida",
  }
  return map[status || ""] || "Em estoque"
}

function customerName(device: ReportDevice) {
  return device.sale?.customers?.full_name || device.warranty?.customers?.full_name || null
}

function reportStatusBadges(device: ReportDevice) {
  const badges: Array<{ label: string; className: string; icon: LucideIcon }> = []

  if (isPendingReview(device)) {
    badges.push({ label: "Pendente de revisão", className: "bg-amber-50 text-amber-700 ring-amber-200", icon: Wrench })
  }

  if (hasReport(device)) {
    badges.push({ label: "Laudo emitido", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 })
  } else {
    badges.push({ label: "Sem laudo", className: "bg-orange-50 text-orange-700 ring-orange-200", icon: XCircle })
  }

  if (hasWarranty(device)) {
    badges.push({ label: "Garantia emitida", className: "bg-teal-50 text-teal-700 ring-teal-200", icon: ShieldCheck })
  }

  if (isSold(device)) {
    badges.push({ label: "Vendido", className: "bg-blue-50 text-blue-700 ring-blue-200", icon: ShoppingBag })
  }

  return badges
}

function actionButtonClass(primary = false) {
  return [
    "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all",
    primary
      ? "bg-royal-500 text-white shadow-sm shadow-royal-500/20 hover:bg-royal-600"
      : "border border-gray-200 bg-white text-navy-800 hover:border-royal-200 hover:bg-royal-50 hover:text-royal-700",
  ].join(" ")
}

function metricPercent(value: number, total: number) {
  if (!total) return "0% do total"
  return `${Math.round((value / total) * 100)}% do total`
}

function templateKeyForDevice(device: ReportDevice) {
  const category = device.product_catalog?.category || ""
  if (category in CHECKLIST_TEMPLATES) return category

  const name = productName(device).toLowerCase()
  if (name.includes("iphone")) return "iphone"
  if (name.includes("ipad")) return "ipad"
  if (name.includes("watch")) return "applewatch"
  if (name.includes("airpods")) return "airpods"
  if (name.includes("macbook")) return "macbook"
  if (name.includes("garmin")) return "garmin"

  return "accessories"
}

function checklistTemplateForDevice(device: ReportDevice): ChecklistDraftItem[] {
  const template = CHECKLIST_TEMPLATES[templateKeyForDevice(device)] || CHECKLIST_TEMPLATES.accessories
  return template.map((item) => ({ ...item }))
}

function selectedStatusClass(status: ChecklistStatus, value: ChecklistStatus) {
  if (status !== value) return "border-slate-200 bg-white text-slate-500 hover:border-royal-200 hover:bg-royal-50"
  if (value === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "fail") return "border-red-200 bg-red-50 text-red-700"
  return "border-slate-300 bg-slate-100 text-slate-700"
}

function latestByInventory<T extends { inventory_id: string | null; created_at?: string | null; completed_at?: string | null; sale_date?: string | null; start_date?: string | null }>(
  rows: T[],
  dateKey: keyof T
) {
  return rows.reduce<Record<string, T>>((acc, row) => {
    if (!row.inventory_id) return acc
    const current = acc[row.inventory_id]
    const nextDate = String(row[dateKey] || row.completed_at || row.created_at || "")
    const currentDate = current ? String(current[dateKey] || current.completed_at || current.created_at || "") : ""
    if (!current || new Date(nextDate).getTime() >= new Date(currentDate).getTime()) {
      acc[row.inventory_id] = row
    }
    return acc
  }, {})
}

function StatCard({
  icon: Icon,
  value,
  title,
  helper,
  tone,
}: {
  icon: LucideIcon
  value: number
  title: string
  helper: string
  tone: "blue" | "green" | "orange" | "purple" | "sky"
}) {
  const tones = {
    blue: "border-blue-100 from-blue-50 text-blue-600 ring-blue-100",
    green: "border-emerald-100 from-emerald-50 text-emerald-600 ring-emerald-100",
    orange: "border-orange-100 from-orange-50 text-orange-600 ring-orange-100",
    purple: "border-purple-100 from-purple-50 text-purple-600 ring-purple-100",
    sky: "border-sky-100 from-sky-50 text-royal-600 ring-sky-100",
  }

  return (
    <div className={`rounded-2xl border bg-gradient-to-br to-white p-4 shadow-sm shadow-navy-900/5 ${tones[tone]}`}>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-current/10 ring-1 ring-current/10">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none text-navy-900">{value}</p>
          <p className="mt-1 text-sm font-semibold text-navy-800">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{helper}</p>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ tab, hasSearch, onClearSearch }: { tab: TabKey; hasSearch: boolean; onClearSearch: () => void }) {
  const content: Record<TabKey, { title: string; description: string; icon: LucideIcon; action?: string }> = {
    all: {
      title: "Nenhum laudo encontrado",
      description: "Quando houver aparelhos no estoque, eles aparecerão aqui com seus laudos e garantias.",
      icon: FileQuestion,
    },
    with_report: {
      title: "Nenhum laudo encontrado",
      description: "Os aparelhos com inspeção técnica emitida ficarão agrupados nesta aba.",
      icon: FileText,
    },
    without_report: {
      title: "Nenhum aparelho sem laudo",
      description: "Tudo certo por aqui. Nenhum aparelho pendente de laudo foi encontrado nesta visão.",
      icon: ClipboardCheck,
    },
    warranties: {
      title: "Nenhuma garantia emitida",
      description: "As garantias vinculadas a vendas concluídas aparecerão aqui para download rápido.",
      icon: ShieldCheck,
    },
    sold: {
      title: "Nenhum vendido com laudo",
      description: "Vendas documentadas aparecerão nesta aba com cliente vinculado e documentos disponíveis.",
      icon: ShoppingBag,
    },
  }

  const current = hasSearch
    ? {
        title: "Nenhum resultado para a busca",
        description: "Tente buscar por produto, IMEI, cliente, data ou status.",
        icon: Search,
        action: "Limpar busca",
      }
    : content[tab]
  const Icon = current.icon

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-royal-50 text-royal-500 ring-1 ring-royal-100">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-base font-bold text-navy-900">{current.title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{current.description}</p>
      {current.action && (
        <Button className="mt-5" variant="outline" size="sm" onClick={onClearSearch}>
          {current.action}
        </Button>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")
  const [devices, setDevices] = useState<ReportDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [selectedReportDeviceId, setSelectedReportDeviceId] = useState("")
  const [draftItems, setDraftItems] = useState<ChecklistDraftItem[]>([])
  const [savingReport, setSavingReport] = useState(false)

  const fetchReportCenter = useCallback(async () => {
    try {
      setLoading(true)

      const [inventoryResult, checklistsResult, salesResult, warrantiesResult] = await Promise.all([
        reportTable<ReportDevice>("inventory")
          .select(`
            id,
            company_id,
            catalog_id,
            imei,
            imei2,
            serial_number,
            grade,
            status,
            purchase_date,
            created_at,
            checklist_id,
            battery_health,
            ios_version,
            condition_notes,
            notes,
            type,
            photos,
            product_catalog:catalog_id (
              id,
              model,
              variant,
              storage,
              color,
              category,
              brand
            )
          `)
          .order("created_at", { ascending: false }),
        reportTable<ChecklistRecord>("checklists")
          .select("id, inventory_id, items, completed_at, created_at, pdf_url, device_type")
          .order("created_at", { ascending: false }),
        reportTable<SaleRecord>("sales")
          .select(`
            id,
            inventory_id,
            customer_id,
            sale_date,
            warranty_months,
            warranty_start,
            warranty_end,
            warranty_pdf_url,
            sale_status,
            payment_method,
            sale_price,
            notes,
            customers (
              id,
              full_name,
              cpf,
              phone,
              email
            )
          `)
          .order("sale_date", { ascending: false }),
        reportTable<WarrantyRecord>("warranties")
          .select(`
            id,
            sale_id,
            inventory_id,
            customer_id,
            start_date,
            end_date,
            status,
            pdf_url,
            notes,
            customers (
              id,
              full_name,
              cpf,
              phone,
              email
            )
          `)
          .order("start_date", { ascending: false }),
      ])

      if (inventoryResult.error) throw inventoryResult.error
      if (checklistsResult.error) throw checklistsResult.error
      if (salesResult.error) throw salesResult.error
      if (warrantiesResult.error) throw warrantiesResult.error

      const checklistsByInventory = latestByInventory((checklistsResult.data || []) as ChecklistRecord[], "completed_at")
      const salesByInventory = latestByInventory(
        ((salesResult.data || []) as SaleRecord[]).filter((sale) => sale.sale_status !== "cancelled"),
        "sale_date"
      )
      const warrantiesByInventory = latestByInventory((warrantiesResult.data || []) as WarrantyRecord[], "start_date")

      const hydrated = ((inventoryResult.data || []) as ReportDevice[])
        .filter(isSeminovoReportDevice)
        .map((item) => ({
          ...item,
          checklist: checklistsByInventory[item.id] || null,
          sale: salesByInventory[item.id] || null,
          warranty: warrantiesByInventory[item.id] || null,
        }))

      setDevices(hydrated)
    } catch (err: unknown) {
      console.error("Erro ao carregar central de laudos:", err)
      toast({
        title: "Erro ao carregar laudos",
        description: getErrorMessage(err),
        type: "error",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchReportCenter()
  }, [fetchReportCenter])

  const reportCandidates = useMemo(() => devices.filter((device) => !hasReport(device)), [devices])
  const selectedReportDevice = useMemo(
    () => reportCandidates.find((device) => device.id === selectedReportDeviceId) || reportCandidates[0] || null,
    [reportCandidates, selectedReportDeviceId]
  )

  const openReportModal = (device?: ReportDevice) => {
    const target = device && !hasReport(device) ? device : reportCandidates[0]

    if (!target) {
      toast({
        title: "Nenhum seminovo pendente",
        description: "Todos os aparelhos seminovos elegíveis já possuem laudo técnico.",
        type: "success",
      })
      return
    }

    setSelectedReportDeviceId(target.id)
    setDraftItems(checklistTemplateForDevice(target))
    setIsReportModalOpen(true)
  }

  const closeReportModal = () => {
    if (savingReport) return
    setIsReportModalOpen(false)
  }

  const handleReportDeviceChange = (deviceId: string) => {
    const nextDevice = reportCandidates.find((device) => device.id === deviceId)
    if (!nextDevice) return
    setSelectedReportDeviceId(deviceId)
    setDraftItems(checklistTemplateForDevice(nextDevice))
  }

  const updateDraftStatus = (id: string, status: ChecklistStatus) => {
    setDraftItems((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  const updateDraftNote = (id: string, note: string) => {
    setDraftItems((items) => items.map((item) => (item.id === id ? { ...item, note } : item)))
  }

  const saveReport = async () => {
    if (!selectedReportDevice) return

    setSavingReport(true)
    try {
      const deviceType = templateKeyForDevice(selectedReportDevice)
      const completedAt = new Date().toISOString()
      const { data: checklist, error: checklistError } = await insertReportTable<
        {
          company_id: string
          inventory_id: string
          device_type: string
          items: ChecklistDraftItem[]
          completed_at: string
        },
        ChecklistRecord
      >("checklists")
        .insert({
          company_id: selectedReportDevice.company_id,
          inventory_id: selectedReportDevice.id,
          device_type: deviceType,
          items: draftItems,
          completed_at: completedAt,
        })
        .select("id, inventory_id, items, completed_at, created_at, pdf_url, device_type")
        .single()

      if (checklistError) throw new Error(checklistError.message || "Erro ao salvar checklist")
      if (!checklist?.id) throw new Error("Checklist salvo sem identificador")

      const { error: inventoryError } = await updateReportTable<{ checklist_id: string }>("inventory")
        .update({ checklist_id: checklist.id })
        .eq("id", selectedReportDevice.id)

      if (inventoryError) throw new Error(inventoryError.message || "Erro ao vincular laudo ao aparelho")

      setDevices((current) =>
        current.map((device) =>
          device.id === selectedReportDevice.id
            ? { ...device, checklist_id: checklist.id, checklist }
            : device
        )
      )
      setIsReportModalOpen(false)
      toast({ title: "Laudo emitido!", description: "O aparelho agora aparece como documentado na central.", type: "success" })
    } catch (error) {
      console.error("Erro ao emitir laudo:", error)
      toast({
        title: "Erro ao emitir laudo",
        description: getErrorMessage(error),
        type: "error",
      })
    } finally {
      setSavingReport(false)
    }
  }

  const counts = useMemo(() => {
    const stocked = devices.filter((item) => !isSold(item)).length
    const withReport = devices.filter(hasReport).length
    const withoutReport = devices.filter((item) => !hasReport(item)).length
    const warranties = devices.filter(hasWarranty).length
    const soldWithReport = devices.filter((item) => isSold(item) && hasReport(item)).length

    return { stocked, withReport, withoutReport, warranties, soldWithReport, total: devices.length }
  }, [devices])

  const latestReport = useMemo(() => {
    return devices
      .filter(hasReport)
      .sort((a, b) => new Date(reportDate(b) || "").getTime() - new Date(reportDate(a) || "").getTime())[0]
  }, [devices])

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase()

    return devices.filter((device) => {
      const tabMatch =
        activeTab === "all" ||
        (activeTab === "with_report" && hasReport(device)) ||
        (activeTab === "without_report" && !hasReport(device)) ||
        (activeTab === "warranties" && hasWarranty(device)) ||
        (activeTab === "sold" && isSold(device))

      if (!tabMatch) return false
      if (!query) return true

      const searchable = compact([
        productName(device),
        productDetails(device),
        device.imei,
        device.imei2,
        device.serial_number,
        customerName(device),
        device.purchase_date ? formatDate(device.purchase_date) : null,
        reportDate(device) ? formatDate(reportDate(device)) : null,
        statusMeta(device.status),
        hasReport(device) ? "laudo emitido" : "sem laudo",
        hasWarranty(device) ? "garantia emitida" : null,
        isSold(device) ? "vendido" : null,
        isPendingReview(device) ? "pendente de revisão" : null,
      ])
        .join(" ")
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [activeTab, devices, search])

  const downloadReport = async (device: ReportDevice) => {
    if (device.checklist?.pdf_url) {
      window.open(device.checklist.pdf_url, "_blank", "noopener,noreferrer")
      return
    }

    if (!device.checklist?.items?.length) {
      toast({
        title: "Laudo ainda não disponível",
        description: "Abra o aparelho para gerar o checklist técnico antes de baixar o PDF.",
        type: "error",
      })
      return
    }

    setLoadingAction({ id: device.id, type: "report" })

    try {
      const { default: jsPDF } = await import("jspdf")
      const html2canvas = (await import("html2canvas")).default
      const wrapper = document.createElement("div")

      wrapper.style.position = "fixed"
      wrapper.style.left = "-10000px"
      wrapper.style.top = "0"
      wrapper.style.width = "760px"
      wrapper.style.background = "#ffffff"
      wrapper.innerHTML = renderChecklistHTML({
        productName: productName(device),
        imei: device.imei || "—",
        serial: device.serial_number || "—",
        grade: device.grade || "—",
        date: formatDate(reportDate(device) || device.created_at),
        items: device.checklist.items.map((item) => ({
          label: item.label || item.id || "Item avaliado",
          status: item.status,
          note: item.note,
        })),
        battery: device.battery_health || undefined,
        iosVersion: device.ios_version || undefined,
      })

      document.body.appendChild(wrapper)
      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      })
      document.body.removeChild(wrapper)

      const pdf = new jsPDF("p", "mm", "a4")
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const marginMm = 10
      const imgWidth = pageW - marginMm * 2
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const pxPerMm = canvas.width / imgWidth
      const pageSlicePx = Math.floor((pageH - marginMm * 2) * pxPerMm)
      const imgData = canvas.toDataURL("image/png")

      pdf.addImage(imgData, "PNG", marginMm, 0, imgWidth, imgHeight)
      let currentPage = 1

      while (currentPage * pageSlicePx < canvas.height) {
        const pageOffsetMm = (currentPage * pageSlicePx) / pxPerMm
        pdf.addPage()
        pdf.addImage(imgData, "PNG", marginMm, marginMm - pageOffsetMm, imgWidth, imgHeight)
        currentPage++
      }

      pdf.save(`laudo-${productName(device).replace(/[^a-zA-Z0-9]+/g, "-")}-${lastDigits(device.imei) || device.id.slice(0, 8)}.pdf`)
    } catch (err) {
      console.error("Erro ao baixar laudo:", err)
      toast({ title: "Erro ao baixar laudo", description: "Não foi possível gerar o PDF deste laudo.", type: "error" })
    } finally {
      setLoadingAction(null)
    }
  }

  const downloadWarranty = async (device: ReportDevice) => {
    const warrantyUrl = device.warranty?.pdf_url || device.sale?.warranty_pdf_url
    if (warrantyUrl) {
      window.open(warrantyUrl, "_blank", "noopener,noreferrer")
      return
    }

    if (!device.sale && !device.warranty) {
      toast({
        title: "Garantia indisponível",
        description: "Este aparelho ainda não possui venda ou garantia vinculada.",
        type: "error",
      })
      return
    }

    setLoadingAction({ id: device.id, type: "warranty" })

    try {
      const warrantyMonths = Number(device.sale?.warranty_months || 0)
      const warrantyData: SaleDocumentData = {
        saleId: device.sale?.id || device.warranty?.id || device.id,
        saleDate: device.sale?.sale_date || device.warranty?.start_date || device.purchase_date || "",
        customerName: customerName(device) || "Cliente",
        customerCpf: device.sale?.customers?.cpf || device.warranty?.customers?.cpf || null,
        customerPhone: device.sale?.customers?.phone || device.warranty?.customers?.phone || null,
        paymentMethod: device.sale?.payment_method || "—",
        saleNotes: device.sale?.notes || device.warranty?.notes || null,
        item: {
          name: productName(device),
          imei: device.imei,
          imei2: device.imei2,
          quantity: 1,
          unitPrice: Number(device.sale?.sale_price || 0),
          totalPrice: Number(device.sale?.sale_price || 0),
          warrantyMonths: warrantyMonths || 3,
        },
      }

      await generateWarrantyPDF(warrantyData)
    } catch (err) {
      console.error("Erro ao baixar garantia:", err)
      toast({ title: "Erro ao baixar garantia", description: "Não foi possível gerar o termo de garantia.", type: "error" })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="min-h-full space-y-5 bg-slate-50/60 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-syne text-3xl font-bold tracking-normal text-navy-900">Central de Laudos</h1>
          <p className="mt-1 text-sm text-slate-500">Controle de laudos técnicos e garantias dos aparelhos seminovos</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={fetchReportCenter} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar lista
          </Button>
          <button type="button" onClick={() => openReportModal()} className={actionButtonClass(true)}>
            <ClipboardPlus className="h-4 w-4" />
            Gerar laudo
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Package} value={counts.stocked} title="Seminovos em estoque" helper="Disponíveis ou em revisão" tone="blue" />
        <StatCard icon={FileCheck2} value={counts.withReport} title="Com laudo emitido" helper={metricPercent(counts.withReport, counts.total)} tone="green" />
        <StatCard icon={FileQuestion} value={counts.withoutReport} title="Sem laudo" helper={metricPercent(counts.withoutReport, counts.total)} tone="orange" />
        <StatCard icon={ShieldCheck} value={counts.warranties} title="Garantias emitidas" helper={metricPercent(counts.warranties, counts.total)} tone="purple" />
        <StatCard icon={ShoppingBag} value={counts.soldWithReport} title="Vendidos com laudo" helper="Documentados" tone="sky" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm shadow-navy-900/5">
        {latestReport ? (
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock className="h-4 w-4 text-royal-500" />
            <span>Último laudo gerado em {formatDate(reportDate(latestReport))}</span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span className="font-medium text-slate-700">{productName(latestReport)}</span>
            <span className="text-slate-400">·</span>
            <span>{maskedIdentity(latestReport)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-royal-500" />
            <span>Nenhum laudo emitido até o momento.</span>
          </div>
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy-900/5">
        <div className="border-b border-slate-200 px-4 pt-3">
          <div className="flex gap-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative whitespace-nowrap px-1 py-4 text-sm font-semibold transition-colors ${
                  activeTab === tab.key ? "text-royal-600" : "text-navy-800 hover:text-royal-600"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-royal-500" />}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 p-4 lg:grid-cols-[1fr_auto]">
          <Input
            placeholder="Buscar por produto, IMEI, cliente ou status..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            icon={<Search className="h-4 w-4" />}
          />
          <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 lg:min-w-64">
            <span>Ordenar por: Mais recentes</span>
            <ArrowDownToLine className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-royal-500" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-4">
            <EmptyState tab={activeTab} hasSearch={Boolean(search.trim())} onClearSearch={() => setSearch("")} />
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(280px,1.45fr)_minmax(190px,0.95fr)_minmax(180px,0.9fr)_minmax(180px,0.95fr)_minmax(260px,1fr)] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-xs font-bold uppercase text-slate-500 lg:grid">
              <span>Aparelho</span>
              <span>Informações</span>
              <span>Documentos</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredDevices.map((device) => {
                const identity = maskedIdentity(device)
                const reportLoading = loadingAction?.id === device.id && loadingAction.type === "report"
                const warrantyLoading = loadingAction?.id === device.id && loadingAction.type === "warranty"
                const soldCustomer = customerName(device)
                const cover = device.photos?.[0]

                return (
                  <article
                    key={device.id}
                    className="grid gap-4 px-4 py-4 transition-colors hover:bg-slate-50/70 lg:grid-cols-[minmax(280px,1.45fr)_minmax(190px,0.95fr)_minmax(180px,0.9fr)_minmax(180px,0.95fr)_minmax(260px,1fr)] lg:items-center lg:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Smartphone className="h-7 w-7" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-navy-900">{productName(device)}</h3>
                        <p className="mt-0.5 truncate text-sm text-slate-500">{productDetails(device) || statusMeta(device.status)}</p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                          <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
                          {identity}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm lg:block lg:space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-400">Entrada no estoque</p>
                        <p className="font-semibold text-navy-900">{formatDate(device.purchase_date || device.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400">Laudo emitido em</p>
                        <p className="font-semibold text-navy-900">{reportDate(device) ? formatDate(reportDate(device)) : "—"}</p>
                      </div>
                      {soldCustomer && (
                        <div className="col-span-2">
                          <p className="text-xs font-semibold text-slate-400">Cliente</p>
                          <p className="truncate font-semibold text-navy-900">{soldCustomer}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      {hasReport(device) ? (
                        <button
                          type="button"
                          onClick={() => downloadReport(device)}
                          disabled={reportLoading}
                          className="flex w-full items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2 text-left text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-60"
                        >
                          {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          <span>
                            <span className="block font-semibold">Laudo</span>
                            <span className="block text-xs text-blue-600/70">{device.checklist?.pdf_url ? "PDF salvo" : "PDF regenerável"}</span>
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openReportModal(device)}
                          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-orange-200 bg-orange-50/40 px-3 py-2 text-left text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50"
                        >
                          <ClipboardPlus className="h-4 w-4" />
                          <span>
                            <span className="block font-semibold">Gerar laudo</span>
                            <span className="block text-xs text-orange-600/70">Fazer agora</span>
                          </span>
                        </button>
                      )}

                      {hasWarranty(device) ? (
                        <button
                          type="button"
                          onClick={() => downloadWarranty(device)}
                          disabled={warrantyLoading}
                          className="flex w-full items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-left text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                        >
                          {warrantyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          <span>
                            <span className="block font-semibold">Garantia</span>
                            <span className="block text-xs text-emerald-600/70">{device.warranty?.pdf_url || device.sale?.warranty_pdf_url ? "PDF salvo" : "Reemitir PDF"}</span>
                          </span>
                        </button>
                      ) : (
                        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">Garantia não emitida</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {reportStatusBadges(device).map((badge) => {
                        const Icon = badge.icon
                        return (
                          <span
                            key={badge.label}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${badge.className}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {badge.label}
                          </span>
                        )
                      })}
                    </div>

                    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                      <Link href={`/estoque/${device.id}`} className={actionButtonClass(false)}>
                        <Eye className="h-4 w-4" />
                        Ver detalhes
                      </Link>

                      {!hasReport(device) ? (
                        <button type="button" onClick={() => openReportModal(device)} className={actionButtonClass(true)}>
                          <ClipboardPlus className="h-4 w-4" />
                          Gerar laudo
                        </button>
                      ) : (
                        <button type="button" onClick={() => downloadReport(device)} className={actionButtonClass(false)} disabled={reportLoading}>
                          {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                          Baixar laudo
                        </button>
                      )}

                      {hasWarranty(device) && (
                        <button type="button" onClick={() => downloadWarranty(device)} className={actionButtonClass(false)} disabled={warrantyLoading}>
                          {warrantyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          {device.warranty?.pdf_url || device.sale?.warranty_pdf_url ? "Baixar garantia" : "Reemitir garantia"}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mostrando {filteredDevices.length} de {devices.length} aparelhos
              </span>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <span>Visão operacional por aparelho</span>
                <RefreshCcw className="h-4 w-4 text-slate-300" />
              </div>
            </div>
          </div>
        )}
      </section>

      {isReportModalOpen && selectedReportDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/45 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-navy-900/30">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-royal-500">Novo laudo técnico</p>
                <h2 className="mt-1 text-xl font-bold text-navy-900">Emitir laudo sem sair da central</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Selecione o aparelho seminovo e marque os itens revisados pela equipe.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReportModal}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
                aria-label="Fechar"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="report-device">
                  Aparelho
                </label>
                <select
                  id="report-device"
                  value={selectedReportDevice.id}
                  onChange={(event) => handleReportDeviceChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-navy-900 outline-none transition-colors focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20"
                >
                  {reportCandidates.map((device) => (
                    <option key={device.id} value={device.id}>
                      {productName(device)} · {maskedIdentity(device)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Resumo</p>
                <p className="mt-1 truncate text-sm font-bold text-navy-900">{productName(selectedReportDevice)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{productDetails(selectedReportDevice) || maskedIdentity(selectedReportDevice)}</p>
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid gap-3">
                {draftItems.map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm shadow-navy-900/5 lg:grid-cols-[minmax(260px,1fr)_260px_minmax(180px,0.8fr)] lg:items-center">
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{item.label}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "ok" as const, label: "OK", icon: Check },
                        { value: "fail" as const, label: "Falha", icon: XCircle },
                        { value: "na" as const, label: "N/A", icon: FileQuestion },
                      ].map((option) => {
                        const Icon = option.icon
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateDraftStatus(item.id, option.value)}
                            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition-colors ${selectedStatusClass(item.status, option.value)}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {option.label}
                          </button>
                        )
                      })}
                    </div>

                    <input
                      value={item.note || ""}
                      onChange={(event) => updateDraftNote(item.id, event.target.value)}
                      placeholder="Observação"
                      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy-900 outline-none transition-colors placeholder:text-slate-400 focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                O laudo será vinculado ao aparelho e ficará disponível para download nesta mesma central.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeReportModal} disabled={savingReport}>
                  Cancelar
                </Button>
                <Button type="button" onClick={saveReport} isLoading={savingReport} disabled={draftItems.length === 0}>
                  <FileCheck2 className="h-4 w-4" />
                  Salvar e emitir laudo
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
