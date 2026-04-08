"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate } from "@/lib/helpers"
import { CHECKLIST_TEMPLATES } from "@/lib/constants"
import jsPDF from "jspdf"
import { ArrowLeft, ShieldCheck, FileText, CreditCard, User, ShoppingCart, AlertTriangle } from "lucide-react"

const checklistLabels: Record<string, string> = {}
for (const [cat, items] of Object.entries(CHECKLIST_TEMPLATES)) {
  for (const item of items) {
    checklistLabels[item.id] = item.label
  }
}

export default function SaleDetailPage() {
  const { id } = useParams() as { id: string }
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [sale, setSale] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [product, setProduct] = useState<any>(null)
  const [checklist, setChecklist] = useState<any[]>([])
  const [checklistData, setChecklistData] = useState<any>(null)

  useEffect(() => {
    const fetchSale = async () => {
      try {
        const { data, error } = await (supabase
          .from("sales") as any)
          .select("*")
          .eq("id", id)
          .single()
        if (error) throw error
        setSale(data)

        if ((data as any)?.customer_id) {
          const { data: c } = await (supabase
            .from("customers") as any)
            .select("*")
            .eq("id", (data as any).customer_id)
            .single()
          setCustomer(c)
        }

        if ((data as any)?.inventory_id) {
          const { data: p, error: invErr } = await (supabase
            .from("inventory") as any)
            .select("*, product_catalog(*)")
            .eq("id", (data as any).inventory_id)
            .single()

          if (!invErr && p) {
            setProduct(p)

            if ((p as any)?.checklist_id) {
              const { data: cl } = await (supabase
                .from("checklists") as any)
                .select("*")
                .eq("id", (p as any).checklist_id)
                .single()
              if (cl?.items) {
                setChecklistData(cl)
                const items = typeof cl.items === "string" ? JSON.parse(cl.items) : cl.items
                setChecklist(items)
              }
            }
          }
        }
      } catch (err) {
        toast({ title: "Venda não encontrada", type: "error" })
        router.push("/vendas")
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchSale()
  }, [id])

  const paymentLabel = () => {
    if (!sale?.payment_method) return "—"
    const map: Record<string, string> = {
      pix: "PIX", cash: "Dinheiro", debit: "Débito",
      credit_1x: "Crédito 1x", credit_2x: "Crédito 2x", credit_3x: "Crédito 3x",
      credit_4x: "Crédito 4x", credit_5x: "Crédito 5x", credit_6x: "Crédito 6x",
      credit_7x: "Crédito 7x", credit_8x: "Crédito 8x", credit_9x: "Crédito 9x",
      credit_10x: "Crédito 10x", credit_11x: "Crédito 11x", credit_12x: "Crédito 12x",
    }
    return map[sale.payment_method] || sale.payment_method
  }

  const generatePDF = async (type: "warranty" | "report") => {
    setGenerating(type)
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

      if (type === "report") {
        drawHeader("Laudo de Inspeção Técnica")

        const catalog = product?.product_catalog || product?.catalog || {}
        const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()

        drawSection("Dados do Aparelho")
        drawRow("Produto:", fullModel)
        drawRow("Categoria:", catalog.category || "—")
        drawRow("Grade:", product?.grade || "—")
        drawRow("IMEI:", product?.imei || "—")
        if (product?.imei2) drawRow("IMEI 2:", product.imei2)
        drawRow("Nº de Série:", product?.serial_number || "—")
        drawRow("Versão iOS:", product?.ios_version || "—")
        drawRow("Bateria:", product?.battery_health ? `${product.battery_health}%` : "—")
        if (product?.condition_notes) drawRow("Observações:", product.condition_notes, false)

        drawSection("Dados da Venda")
        drawRow("Cliente:", customer?.full_name || "—")
        drawRow("CPF:", customer?.cpf || "—")
        drawRow("Preço:", formatBRL(sale?.sale_price))
        drawRow("Pagamento:", paymentLabel())
        drawRow("Data:", formatDate(sale?.sale_date))

        if (checklist.length > 0) {
          drawSection("Checklist de Inspeção")

          for (const item of checklist) {
            if (y > 265) { addPage() }
            const label = checklistLabels[item.id] || item.label || item.id
            const statusLabel = item.status === "ok" ? "OK" : item.status === "fail" ? "FALHA" : item.status === "na" ? "N/A" : "—"
            const statusColor = item.status === "ok" ? [34, 197, 94] : item.status === "fail" ? [239, 68, 68] : item.status === "na" ? [107, 114, 128] : [200, 200, 200]
            const bgCol = item.status === "ok" ? [240, 253, 244] : item.status === "fail" ? [254, 242, 242] : item.status === "na" ? [249, 250, 251] : [255, 255, 255]

            doc.setFillColor(bgCol[0], bgCol[1], bgCol[2])
            doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2])
            doc.setLineWidth(0.2)
            const rowH = item.note ? 14 : 9
            doc.roundedRect(M, y, pageW, rowH, 1, 1, "FD")

            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(30, 30, 30)
            doc.text(label.substring(0, 80), M + 3, y + 5)

            const badgeX = W - M - 25
            doc.setFillColor(statusColor[0], statusColor[1], statusColor[2])
            const badgeW = 22
            doc.roundedRect(badgeX - 2, y + 1.5, badgeW, 5.5, 1, 1, "F")
            doc.setTextColor(255, 255, 255)
            doc.setFont("helvetica", "bold")
            doc.text(statusLabel, badgeX + 4, y + 5.3, { align: "center" })

            if (item.note) {
              doc.setTextColor(180, 30, 30)
              doc.setFont("helvetica", "italic")
              doc.setFontSize(7.5)
              const noteLines = doc.splitTextToSize(item.note, pageW - 20)
              doc.text(noteLines[0], M + 3, y + 11)
            }

            y += rowH + 2
          }

          y += 4
          const okCount = checklist.filter((i: any) => i.status === "ok").length
          const failCount = checklist.filter((i: any) => i.status === "fail").length
          const total = checklist.length
          const pct = total > 0 ? Math.round((okCount / total) * 100) : 0

          drawRow("Aprovados:", `${okCount} de ${total} (${pct}%)`)
          drawRow("Falhas:", `${failCount}`)
        }

        y += 10
        if (y > 240) addPage()
        drawSection("Responsável Técnico")
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.3)
        doc.line(M + 10, y + 12, M + 70, y + 12)
        doc.text("NobreTech Store", M + 10, y + 17)

        doc.line(W - M - 60, y + 12, W - M - 20, y + 12)
        doc.text(customer?.full_name || "Cliente", W / 2 + 10, y + 17, { align: "center" })

        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, M, 285)

        doc.save(`Laudo_Inspecao_${customer?.full_name || "cliente"}.pdf`)
      }

      if (type === "warranty") {
        drawHeader("Certificado de Garantia")

        const catalog = product?.product_catalog || product?.catalog || {}
        const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()

        y += 4
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(140, 140, 140)
        doc.text(`Nº da Garantia: ${id}`, W / 2, y, { align: "center" })
        y += 10

        drawSection("Aparelho Coberto")
        drawRow("Produto:", fullModel)
        drawRow("Grade:", product?.grade || "—")
        drawRow("IMEI:", product?.imei || "—")
        drawRow("Bateria:", product?.battery_health ? `${product.battery_health}%` : "—")

        y += 4
        drawSection("Proprietário")
        drawRow("Nome:", customer?.full_name || "—")
        drawRow("CPF:", customer?.cpf || "—")
        if (customer?.phone) drawRow("Telefone:", customer.phone)

        y += 4
        drawSection("Período de Cobertura")
        drawRow("Início:", formatDate(sale?.warranty_start))
        drawRow("Término:", formatDate(sale?.warranty_end))
        drawRow("Duração:", `${sale?.warranty_months} meses`)

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

        addPage()
        drawHeader("Certificado de Garantia — Cuidados")

        y += 5
        doc.setFontSize(13)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 82, 167)
        doc.text("Dicas de Cuidado com seu Aparelho", W / 2, y, { align: "center" })
        y += 8

        const careTips = [
          { title: "Bateria", tips: ["Mantenha a carga entre 20% e 80%", "Evite carregadores não certificados", "Não use enquanto carrega"] },
          { title: "Tela e Display", tips: ["Use película de vidro", "Limpe com microfibra", "Evite pressão excessiva"] },
        ]

        for (const section of careTips) {
          if (y > 230) { addPage(); drawHeader("Certificado de Garantia — Cuidados") }
          doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(section.title, M, y); y += 6
          for (const tip of section.tips) { doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.text(`• ${tip}`, M + 2, y); y += 5 }
          y += 3
        }

        y += 6
        drawSection("Termos e Condições")
        const terms = ["1. Certificado pessoal e intransferível.", "2. Apresente este termo para acionar garantia."]
        for (const t of terms) { doc.setFontSize(8); doc.text(t, M + 3, y); y += 5 }

        y += 12
        doc.line(M + 10, y, M + 75, y); doc.text("NobreTech Store", M + 10, y + 5)
        doc.line(W - M - 70, y, W - M - 20, y); doc.text(customer?.full_name || "Cliente", W / 2 + 5, y + 5, { align: "center" })

        doc.save(`Certificado_Garantia_${customer?.full_name || "cliente"}.pdf`)
      }

      toast({ title: "Arquivo gerado!", type: "success" })
    } catch (err) {
      toast({ title: "Erro ao gerar PDF", type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Carregando...</p></div>
  if (!sale) return null

  const catalog = product?.product_catalog || product?.catalog || {}
  const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()
  const okCount = checklist.filter((i: any) => i.status === "ok").length
  const failCount = checklist.filter((i: any) => i.status === "fail").length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push("/vendas")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Detalhes da Venda</h2>
            <p className="text-xs text-gray-400">ID: {id.slice(0, 8)}</p>
          </div>
        </div>
        <Badge variant="green">Concluída</Badge>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><ShoppingCart className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Aparelho</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Modelo</p>
            <p className="text-sm font-semibold text-navy-900">{fullModel}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">IMEI</p>
            <p className="text-sm font-mono text-navy-900">{product?.imei || "—"}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Status</p>
            <p className="text-sm font-semibold text-navy-900">{product?.grade || "—"}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><User className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Cliente</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-semibold text-navy-900">{customer?.full_name || "—"}</p>
            <p className="text-xs text-gray-500">{customer?.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">CPF: {customer?.cpf || "—"}</p>
            <p className="text-xs text-gray-500">{customer?.email || "—"}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <h3 className="font-display font-bold text-navy-900 mb-4 font-syne">Documentos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="outline"
            onClick={() => generatePDF("report")}
            isLoading={generating === "report"}
            className="flex items-center gap-3 p-6 h-auto"
          >
            <FileText className="w-6 h-6 text-navy-900 shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-navy-900">Laudo Técnico</p>
              <p className="text-xs text-gray-400">Checklist completo</p>
            </div>
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => generatePDF("warranty")}
            isLoading={generating === "warranty"}
            className="flex items-center gap-3 p-6 h-auto"
          >
            <ShieldCheck className="w-6 h-6 text-success-500 shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-navy-900">Termo de Garantia</p>
              <p className="text-xs text-gray-400">Certificado de cobertura</p>
            </div>
          </Button>
        </div>
      </div>
    </div>
  )
}
