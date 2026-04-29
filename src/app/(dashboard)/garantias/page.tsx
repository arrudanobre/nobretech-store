"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toaster"
import { formatBRL, formatDate, daysBetween, todayISO, addDaysISO } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import { generateWarrantyPDF as generateWarrantyTermDocument, generateReceiptPDF as generateReceiptDocument, type SaleDocumentData } from "@/lib/sale-documents"
import { Search, ShieldCheck, Download, FileText } from "lucide-react"
import jsPDF from "jspdf"

function getWarrantyProductName(w: any) {
  const catalog = w.inventory?.product_catalog
  if (!catalog) return "Produto não identificado"
  return `${catalog.model || ""}${catalog.variant ? ` ${catalog.variant}` : ""}${catalog.storage ? ` ${catalog.storage}` : ""}${catalog.color ? ` ${catalog.color}` : ""}`.trim()
}

function getWarrantyPeriod(w: any) {
  const start = w.sales?.sale_date || w.sales?.warranty_start || w.start_date
  const months = Number(w.sales?.warranty_months || 0)
  const totalDays = Math.max(0, months * 30)
  const end = totalDays > 0 ? addDaysISO(start, totalDays) : (w.sales?.warranty_end || w.end_date)
  const remainingDays = Math.max(0, daysBetween(todayISO(), end))

  return { start, end, totalDays, remainingDays }
}

function getWarrantyStatusMeta(w: any) {
  const period = getWarrantyPeriod(w)

  if (w.status === "expired" || period.remainingDays <= 0) {
    return { label: "Vencida", variant: "red" as const, period }
  }

  if (w.status === "voided") {
    return { label: "Cancelada", variant: "gray" as const, period }
  }

  if (w.status === "expiring_soon" || period.remainingDays <= 15) {
    return { label: "Vencendo", variant: "yellow" as const, period }
  }

  return { label: "Ativa", variant: "green" as const, period }
}

export default function WarrantiesPage() {
  const { toast } = useToast()
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [warranties, setWarranties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)

  useEffect(() => {
    fetchWarranties()
  }, [])

  const fetchWarranties = async () => {
    try {
      const { data, error } = await (supabase
        .from("warranties") as any)
        .select(`
          id,
          start_date,
          end_date,
          status,
          notes,
          sales (
            id,
            sale_price,
            payment_method,
            sale_date,
            warranty_months,
            warranty_start,
            warranty_end
          ),
          inventory (
            id,
            imei,
            imei2,
            battery_health,
            grade,
            serial_number,
            ios_version,
            condition_notes,
            product_catalog (
              model,
              variant,
              storage,
              color,
              category
            )
          ),
          customers (
            id,
            full_name,
            cpf,
            phone,
            email
          )
        `)
        .order("end_date", { ascending: true })

      if (error) throw error
      setWarranties(data || [])
    } catch (err: any) {
      console.error("Erro ao carregar garantias:", err)
      toast({ title: "Erro ao carregar garantias", description: err.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const generateWarrantyPDF = async (w: any) => {
    setGenerating(w.id)
    try {
      const doc = new jsPDF()
      const W = 210
      const M = 18
      const pageW = W - M * 2
      let y = 15

      const addPage = () => { doc.addPage(); y = 15 }

      const logoUrl = `${window.location.origin}/logo-nobretech.png`
      let logoB64: string | null = null
      try {
        const resp = await fetch(logoUrl)
        const arr = await resp.arrayBuffer()
        logoB64 = btoa(String.fromCharCode(...new Uint8Array(arr)))
      } catch { /* logo not available */ }

      const drawHeader = (title: string) => {
        y = 15
        if (logoB64) {
          try { doc.addImage(logoB64, "PNG", M, y, 35, 12) } catch { /* fallback */ }
        } else {
          doc.setFontSize(12)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 82, 167)
          doc.text("NOBRETECH", W / 2, y + 7, { align: "center" })
          doc.setTextColor(30, 30, 30)
        }
        y += 16
        doc.setFontSize(16)
        doc.setFont("helvetica", "bold")
        doc.text(title, W / 2, y, { align: "center" })
        y += 3
        doc.setDrawColor(0, 82, 167)
        doc.setLineWidth(0.7)
        doc.line(M, y, W - M, y)
        y += 8
      }

      const drawSection = (title: string) => {
        y += 4
        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 82, 167)
        doc.text(title, M, y)
        y += 2
        doc.setDrawColor(200, 210, 220)
        doc.setLineWidth(0.3)
        doc.line(M, y, W - M, y)
        y += 7
        doc.setTextColor(30, 30, 30)
      }

      const drawRow = (label: string, value: string, bold = true) => {
        if (y > 270) { addPage() }
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(120, 120, 120)
        doc.text(label, M + 4, y)
        doc.setTextColor(30, 30, 30)
        if (bold) doc.setFont("helvetica", "bold")
        else doc.setFont("helvetica", "normal")
        doc.text(value, M + 60, y)
        y += 6
      }

      // ── Certificado de Garantia ──
      drawHeader("Certificado de Garantia")

      const catalog = w.inventory?.product_catalog || {}
      const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()
      const customerName = w.customers?.full_name || "—"
      const cpf = w.customers?.cpf || "—"
      const phone = w.customers?.phone || "—"
      const imei = w.inventory?.imei || "—"
      const grade = w.inventory?.grade || "—"
      const battery = w.inventory?.battery_health ? `${w.inventory.battery_health}%` : "—"

      const warrantyPeriod = getWarrantyPeriod(w)
      const startDate = warrantyPeriod.start || "—"
      const endDate = warrantyPeriod.end || "—"
      const warrantyMonths = w.sales?.warranty_months || "—"
      const salePrice = w.sales?.sale_price || 0

      // Certificate number
      y += 4
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(140, 140, 140)
      doc.text(`Nº da Garantia: ${w.id}`, W / 2, y, { align: "center" })
      y += 10

      // Product
      drawSection("Aparelho Coberto")
      drawRow("Produto:", fullModel)
      drawRow("Categoria:", catalog.category || "—")
      drawRow("Grade:", grade)
      drawRow("IMEI:", imei)
      drawRow("Nº de Série:", w.inventory?.serial_number || "—")
      drawRow("Bateria:", battery)

      y += 4
      drawSection("Proprietário")
      drawRow("Nome:", customerName)
      drawRow("CPF:", cpf)
      if (phone !== "—") drawRow("Telefone:", phone)

      y += 4
      drawSection("Período de Cobertura")
      drawRow("Início:", formatDate(startDate))
      drawRow("Término:", formatDate(endDate))
      drawRow("Duração:", `${warrantyMonths} meses`)
      drawRow("Valor da Venda:", formatBRL(salePrice))

      // What's covered
      y += 6
      drawSection("O que está coberto")

      const coveredItems = [
        "Defeitos internos de funcionamento (placa, chipset, componentes)",
        "Problemas de software e sistema operacional",
        "Funcionamento anormal da bateria (degradação excessiva)",
        "Defeitos em botões, conectores e sensores internos",
        "Problemas de conectividade (Wi-Fi, Bluetooth, NFC) sem causa externa",
        "Falhas de tela (manchas, linhas, toque fantasma) sem dano físico",
      ]

      for (const item of coveredItems) {
        if (y > 270) { addPage() }
        doc.setFillColor(240, 253, 244)
        doc.roundedRect(M, y, pageW, 7, 1, 1, "F")
        doc.setFontSize(9)
        doc.setTextColor(34, 130, 66)
        doc.setFont("helvetica", "bold")
        doc.text("✓", M + 3, y + 5)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(30, 60, 30)
        doc.text(item, M + 10, y + 5)
        y += 9
      }

      // What's NOT covered
      y += 4
      drawSection("O que NÃO está coberto")

      const notCoveredItems = [
        "Danos físicos: quedas, amassados, trincas ou riscos na tela/carcaça",
        "Danos por líquidos: oxidação, contato com água ou outros líquidos",
        "Uso inadequado: exposição a calor excessivo, umidade extrema",
        "Aparelho com jailbreak, rooting ou software modificado",
        "Desgaste natural de bateria abaixo de 80% por uso prolongado",
        "Acesso técnico por terceiros não autorizados pela NobreTech",
        "Perda, roubo ou furto do aparelho",
        "Danos causados por acessórios não originais",
      ]

      for (const item of notCoveredItems) {
        if (y > 270) { addPage() }
        doc.setFillColor(254, 242, 242)
        doc.roundedRect(M, y, pageW, 7, 1, 1, "F")
        doc.setFontSize(9)
        doc.setTextColor(200, 40, 40)
        doc.setFont("helvetica", "bold")
        doc.text("✕", M + 3, y + 5)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(80, 30, 30)
        doc.text(item, M + 10, y + 5)
        y += 9
      }

      // Care tips - page 2
      addPage()
      drawHeader("Certificado de Garantia — Cuidados")

      y += 5
      doc.setFontSize(13)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(0, 82, 167)
      doc.text("Dicas de Cuidado com seu Aparelho", W / 2, y, { align: "center" })
      y += 8

      const careTips = [
        {
          title: "Bateria",
          tips: [
            "Mantenha a carga entre 20% e 80% para maior durabilidade",
            "Evite deixar carregando a noite inteira frequentemente",
            "Use apenas carregadores originais ou certificados (MFi)",
            "Evite usar o aparelho enquanto carrega — gera superaquecimento",
          ],
        },
        {
          title: "Tela e Display",
          tips: [
            "Use película de vidro temperado para proteger contra riscos",
            "Limpe a tela com pano de microfibra — evite produtos químicos",
            "Não pressione a tela com força excessiva no bolso ou bolsa",
            "Evite exposição direta ao sol por períodos prolongados",
          ],
        },
        {
          title: "Temperatura e Ambiente",
          tips: [
            "Não deixe o aparelho no carro em dias quentes",
            "Evite ambientes com umidade extrema (banheiro com vapor)",
            "Temperatura ideal de operação: entre 0°C e 35°C",
            "Se molhar, desligue imediatamente e procure assistência",
          ],
        },
        {
          title: "Software e Atualizações",
          tips: [
            "Mantenha o sistema operacional sempre atualizado",
            "Faça backup regular dos seus dados (iCloud ou computador)",
            "Evite instalar aplicativos de fontes desconhecidas",
            "Se notar lentidão, reinicie o aparelho periodicamente",
          ],
        },
        {
          title: "Transporte e Armazenamento",
          tips: [
            "Use capas protetoras para o dia a dia",
            "Não guarde com moedas ou objetos metálicos no bolso",
            "Para viagens, leve em estojo apropriado",
            "Se não usar por muito tempo, mantenha com 50% de carga",
          ],
        },
      ]

      for (const section of careTips) {
        if (y > 230) { addPage(); drawHeader("Certificado de Garantia — Cuidados"); y += 10 }

        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(30, 30, 30)
        doc.text(section.title, M, y)
        y += 2
        doc.setDrawColor(220, 225, 230)
        doc.setLineWidth(0.3)
        doc.line(M, y, W - M, y)
        y += 6

        for (const tip of section.tips) {
          if (y > 275) { addPage(); drawHeader("Certificado de Garantia — Cuidados"); y += 10 }
          doc.setFontSize(8.5)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(70, 70, 70)
          doc.text(`• ${tip}`, M + 2, y)
          y += 5.5
        }
        y += 3
      }

      // Terms and signatures
      y += 6
      drawSection("Termos e Condições")

      const terms = [
        "1. Este certificado é pessoal e intransferível. A garantia é válida exclusivamente para o comprador original identificado neste documento.",
        "2. Para acionar a garantia, é necessária a apresentação deste certificado junto com comprovante de pagamento.",
        "3. O reparo em garantia será realizado em até 30 dias conforme Código de Defesa do Consumidor (Lei 8.078/90).",
        "4. Caso o reparo não seja possível, o cliente terá direito à substituição do produto ou restituição do valor pago.",
        "5. Danos causados ao aparelho durante o reparo em garantia serão cobertos pela NobreTech Store.",
        "6. O período de garantia pode ser estendido caso o aparelho fique retido para reparo.",
        "7. Esta garantia não cobre acessórios que acompanham o aparelho (carregadores, cabos, capas).",
        "8. A NobreTech Store reserva-se o direito de avaliar e diagnosticar o aparelho para determinar se o defeito está coberto.",
      ]

      for (const t of terms) {
        if (y > 270) { addPage() }
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(80, 80, 80)
        const lines = doc.splitTextToSize(t, pageW - 6)
        doc.text(lines, M + 3, y)
        y += lines.length * 4.5 + 2
      }

      // Signatures
      y += 12
      doc.setDrawColor(150, 150, 150)
      doc.setLineWidth(0.4)
      doc.line(M + 10, y, M + 75, y)
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.setFont("helvetica", "normal")
      doc.text("NobreTech Store", M + 10, y + 5)

      doc.line(W - M - 70, y, W - M - 20, y)
      doc.text(customerName, W / 2 + 5, y + 5, { align: "center" })

      y += 12
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.text(`Data da emissão: ${new Date().toLocaleDateString("pt-BR")}`, M, y)

      const safeName = customerName.replace(/\s+/g, "_")
      doc.save(`Certificado_Garantia_${safeName}.pdf`)

      toast({ title: "Certificado gerado!", type: "success" })
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err)
      toast({ title: "Erro ao gerar PDF", description: err.message, type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  const generateWarrantyTermPDF = async (w: any) => {
    setGenerating(w.id + '_term')
    try {
      const catalog = w.inventory?.product_catalog || {}
      const productName = `${catalog.model || "Aparelho"}${catalog.variant ? ` ${catalog.variant}` : ""}${catalog.storage ? ` ${catalog.storage}` : ""}${catalog.color ? ` ${catalog.color}` : ""}`.trim()
      const documentData: SaleDocumentData = {
        saleId: w.sales?.id || w.id,
        saleDate: w.sales?.sale_date || w.start_date,
        customerName: w.customers?.full_name || "Cliente",
        customerCpf: w.customers?.cpf || null,
        customerPhone: w.customers?.phone || null,
        paymentMethod: w.sales?.payment_method || "",
        saleNotes: w.notes || w.inventory?.condition_notes || null,
        item: {
          name: productName,
          imei: w.inventory?.imei || null,
          imei2: w.inventory?.imei2 || null,
          quantity: 1,
          unitPrice: Number(w.sales?.sale_price || 0),
          totalPrice: Number(w.sales?.sale_price || 0),
          warrantyMonths: Number(w.sales?.warranty_months || 0),
        },
      }

      await generateWarrantyTermDocument(documentData)
      toast({ title: "Termo de garantia gerado!", type: "success" })
    } catch (err) {
      console.error("Erro ao gerar termo novo:", err)
      toast({ title: "Erro ao gerar termo", type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  const generateWarrantyReceiptPDF = async (w: any) => {
    setGenerating(w.id + '_receipt')
    try {
      const catalog = w.inventory?.product_catalog || {}
      const productName = `${catalog.model || "Aparelho"}${catalog.variant ? ` ${catalog.variant}` : ""}${catalog.storage ? ` ${catalog.storage}` : ""}${catalog.color ? ` ${catalog.color}` : ""}`.trim()
      const documentData: SaleDocumentData = {
        saleId: w.sales?.id || w.id,
        saleDate: w.sales?.sale_date || w.start_date,
        customerName: w.customers?.full_name || "Cliente",
        customerCpf: w.customers?.cpf || null,
        customerPhone: w.customers?.phone || null,
        paymentMethod: w.sales?.payment_method || "",
        saleNotes: w.notes || w.inventory?.condition_notes || null,
        item: {
          name: productName,
          imei: w.inventory?.imei || null,
          imei2: w.inventory?.imei2 || null,
          quantity: 1,
          unitPrice: Number(w.sales?.sale_price || 0),
          totalPrice: Number(w.sales?.sale_price || 0),
          warrantyMonths: Number(w.sales?.warranty_months || 0),
        },
      }

      await generateReceiptDocument(documentData)
      toast({ title: "Recibo gerado!", type: "success" })
    } catch (err) {
      console.error("Erro ao gerar recibo:", err)
      toast({ title: "Erro ao gerar recibo", type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  const filtered = warranties.filter((w) => {
    const matchFilter =
      filter === "all" ||
      (filter === "active" && w.status === "active") ||
      (filter === "expiring" && w.status === "expiring_soon") ||
      (filter === "expired" && w.status === "expired") ||
      (filter === "voided" && w.status === "voided")

    const customerName = w.customers?.full_name || ""
    const productModel = w.inventory?.product_catalog?.model || ""
    const matchSearch =
      !search ||
      customerName.toLowerCase().includes(search.toLowerCase()) ||
      productModel.toLowerCase().includes(search.toLowerCase())

    return matchFilter && matchSearch
  })

  const counts = {
    all: warranties.length,
    active: warranties.filter((w) => w.status === "active").length,
    expiring: warranties.filter((w) => w.status === "expiring_soon").length,
    expired: warranties.filter((w) => w.status === "expired").length,
  }

  const filters = [
    { key: "all", label: "Todas" },
    { key: "active", label: "Ativas" },
    { key: "expiring", label: "Vencendo" },
    { key: "expired", label: "Vencidas" },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Garantias</h2>
        <p className="text-sm text-gray-500">{counts.active} ativas · {counts.expiring} vencendo em breve</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
              filter === f.key
                ? "bg-navy-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-navy-900"
            }`}
          >
            {f.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                filter === f.key ? "bg-white/20" : "bg-gray-100"
              }`}
            >
              {counts[f.key as keyof typeof counts]}
            </span>
          </button>
        ))}
      </div>

      <Input
        placeholder="Buscar por cliente ou produto…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-navy-900 font-medium">Nenhuma garantia encontrada.</p>
          <p className="text-sm text-gray-500 mt-1">
            Garantias são criadas automaticamente ao registrar uma venda.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Produto / Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Período</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Garantia</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Valor</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((w) => {
                  const productName = getWarrantyProductName(w)
                  const customerName = w.customers?.full_name || "Cliente não identificado"
                  const salePrice = Number(w.sales?.sale_price || 0)
                  const statusMeta = getWarrantyStatusMeta(w)

                  return (
                    <tr key={w.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-navy-900 truncate max-w-[260px]">{productName}</p>
                        <p className="text-xs text-gray-400">{customerName}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(statusMeta.period.start)} → {formatDate(statusMeta.period.end)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusMeta.variant} dot>
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <p className="font-semibold text-navy-900">{statusMeta.period.totalDays}d total</p>
                        <p className="text-xs text-gray-400">{statusMeta.period.remainingDays}d restantes</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-navy-900 whitespace-nowrap">
                        {formatBRL(salePrice)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generateWarrantyReceiptPDF(w)}
                            isLoading={generating === w.id + '_receipt'}
                            disabled={!w.sales?.id}
                            title={!w.sales?.id ? "Recibo não disponível" : undefined}
                            className={!w.sales?.id ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Recibo
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generateWarrantyTermPDF(w)}
                            isLoading={generating === w.id + '_term'}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Termo
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-gray-50">
            {filtered.map((w) => {
              const productName = getWarrantyProductName(w)
              const customerName = w.customers?.full_name || "Cliente não identificado"
              const salePrice = Number(w.sales?.sale_price || 0)
              const statusMeta = getWarrantyStatusMeta(w)

              return (
                <div key={w.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900 truncate">{productName}</p>
                      <p className="text-xs text-gray-400">{customerName}</p>
                    </div>
                    <Badge variant={statusMeta.variant} dot>
                      {statusMeta.label}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-gray-400">Período</p>
                      <p className="font-medium text-gray-600">
                        {formatDate(statusMeta.period.start)} → {formatDate(statusMeta.period.end)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400">Garantia</p>
                      <p className="font-semibold text-navy-900">{statusMeta.period.totalDays}d total</p>
                      <p className="text-gray-400">{statusMeta.period.remainingDays}d restantes</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-navy-900">{formatBRL(salePrice)}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateWarrantyReceiptPDF(w)}
                        isLoading={generating === w.id + '_receipt'}
                        disabled={!w.sales?.id}
                        className={!w.sales?.id ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Recibo
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateWarrantyTermPDF(w)}
                        isLoading={generating === w.id + '_term'}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Termo
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
