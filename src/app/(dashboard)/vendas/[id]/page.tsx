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
        const { data, error } = await supabase
          .from("sales")
          .select("*")
          .eq("id", id)
          .single()
        if (error) throw error
        setSale(data)

        if (data?.customer_id) {
          const { data: c } = await supabase
            .from("customers")
            .select("*")
            .eq("id", data.customer_id)
            .single()
          setCustomer(c)
        }

        if (data?.inventory_id) {
          const { data: p, error: invErr } = await supabase
            .from("inventory")
            .select("*, product_catalog(*)")
            .eq("id", data.inventory_id)
            .single()

          if (!invErr && p) {
            setProduct(p)

            // Fetch checklist if linked
            if (p?.checklist_id) {
              const { data: cl } = await supabase
                .from("checklists")
                .select("*")
                .eq("id", p.checklist_id)
                .single()
              if (cl?.items) {
                setChecklistData(cl)
                const items = typeof cl.items === "string" ? JSON.parse(cl.items) : cl.items
                setChecklist(items)
              }
            }
          } else if (data.customer_id) {
            // Fallback: fetch catalog info from customer join
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

      // ── Shared header with logo ──
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

      const drawBox = (h: number) => {
        doc.setDrawColor(220, 225, 230)
        doc.setLineWidth(0.3)
        const boxY = y - 2
        doc.rect(M, boxY, pageW, h, "S")
        y = boxY
      }

      // ════════════════════════════════════════════════
      //  LAUDO DE INSPEÇÃO
      // ════════════════════════════════════════════════

      if (type === "report") {
        drawHeader("Laudo de Inspeção Técnica")

        const catalog = product?.product_catalog || product?.catalog || {}
        const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()

        // Device info
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

        // Sale info
        drawSection("Dados da Venda")
        drawRow("Cliente:", customer?.full_name || "—")
        drawRow("CPF:", customer?.cpf || "—")
        drawRow("Preço:", formatBRL(sale?.sale_price))
        drawRow("Pagamento:", paymentLabel())
        drawRow("Data:", formatDate(sale?.sale_date))

        // Checklist
        if (checklist.length > 0) {
          drawSection("Checklist de Inspeção")

          for (const item of checklist) {
            if (y > 265) { addPage() }
            const label = checklistLabels[item.id] || item.label || item.id
            const statusLabel = item.status === "ok" ? "OK" : item.status === "fail" ? "FALHA" : item.status === "na" ? "N/A" : "—"
            const statusColor = item.status === "ok" ? [34, 197, 94] : item.status === "fail" ? [239, 68, 68] : item.status === "na" ? [107, 114, 128] : [200, 200, 200]
            const bgCol = item.status === "ok" ? [240, 253, 244] : item.status === "fail" ? [254, 242, 242] : item.status === "na" ? [249, 250, 251] : [255, 255, 255]

            doc.setFillColor(...bgCol)
            doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2])
            doc.setLineWidth(0.2)
            const rowH = item.note ? 14 : 9
            doc.roundedRect(M, y, pageW, rowH, 1, 1, "FD")

            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(30, 30, 30)
            doc.text(label.substring(0, 80), M + 3, y + 5)

            // Status badge
            const badgeX = W - M - 25
            doc.setFillColor(...statusColor)
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

          // Summary
          y += 4
          const okCount = checklist.filter((i: any) => i.status === "ok").length
          const failCount = checklist.filter((i: any) => i.status === "fail").length
          const naCount = checklist.filter((i: any) => i.status === "na").length
          const total = checklist.length
          const pct = total > 0 ? Math.round((okCount / total) * 100) : 0

          drawRow("Aprovados:", `${okCount} de ${total} (${pct}%)`)
          drawRow("Falhas:", `${failCount}`)
          drawRow("N/A:", `${naCount}`)
        }

        // Footer
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

      // ════════════════════════════════════════════════
      //  CERTIFICADO DE GARANTIA
      // ════════════════════════════════════════════════

      if (type === "warranty") {
        drawHeader("Certificado de Garantia")

        const catalog = product?.product_catalog || product?.catalog || {}
        const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()

        // Certificate number
        y += 4
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(140, 140, 140)
        doc.text(`Nº da Garantia: ${id}`, W / 2, y, { align: "center" })
        y += 10

        // ── Product + Customer box ──
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

        // ── What's covered ──
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

        // ── What's NOT covered ──
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

        // ── Care tips - page 2 ──
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
            icon: "🔋",
            title: "Bateria",
            tips: [
              "Mantenha a carga entre 20% e 80% para maior durabilidade",
              "Evite deixar carregando a noite inteira frequentemente",
              "Use apenas carregadores originais ou certificados (MFi)",
              "Evite usar o aparelho enquanto carrega — gera superaquecimento",
            ],
          },
          {
            icon: "📱",
            title: "Tela e Display",
            tips: [
              "Use película de vidro temperado para proteger contra riscos",
              "Limpe a tela com pano de microfibra — evite produtos químicos",
              "Não pressione a tela com força excessiva no bolso ou bolsa",
              "Evite exposição direta ao sol por períodos prolongados",
            ],
          },
          {
            icon: "🌡️",
            title: "Temperatura e Ambiente",
            tips: [
              "Não deixe o aparelho no carro em dias quentes",
              "Evite ambientes com umidade extrema (banheiro com vapor)",
              "Temperatura ideal de operação: entre 0°C e 35°C",
              "Se molhar, desligue imediatamente e procure assistência",
            ],
          },
          {
            icon: "🔄",
            title: "Software e Actualizações",
            tips: [
              "Mantenha o sistema operacional sempre atualizado",
              "Faça backup regular dos seus dados (iCloud ou computador)",
              "Evite instalar aplicativos de fontes desconhecidas",
              "Se notar lentidão, reinicie o aparelho periodicamente",
            ],
          },
          {
            icon: "🎒",
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
          doc.text(`${section.title}`, M, y)
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

        // ── Terms and signatures ──
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
          "8. A NobreTech Store reserva-se o direito de avaliar e diagnosticar o aparelho para determinar se o defeuto está coberto.",
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
        doc.text(customer?.full_name || "Cliente", W / 2 + 5, y + 5, { align: "center" })

        // Date
        y += 12
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`Data da emissão: ${new Date().toLocaleDateString("pt-BR")}`, M, y)

        doc.save(`Certificado_Garantia_${customer?.full_name || "cliente"}.pdf`)
      }

      toast({ title: type === "warranty" ? "Certificado gerado!" : "Laudo gerado!", type: "success" })
    } catch (err) {
      console.error("Erro ao gerar PDF:", err)
      toast({ title: "Erro ao gerar PDF", description: err instanceof Error ? err.message : "Erro interno.", type: "error" })
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
          <h3 className="font-display font-bold text-navy-900 font-syne">Produto</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Aparelho</p>
            <p className="text-sm font-semibold text-navy-900">{fullModel}</p>
            {catalog.brand && <p className="text-xs text-gray-500">{catalog.brand}</p>}
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">IMEI</p>
            <p className="text-sm font-mono text-navy-900">{product?.imei || "—"}</p>
            {product?.serial_number && <p className="text-xs text-gray-500">S/N: {product.serial_number}</p>}
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Grade / Bateria</p>
            <p className="text-sm font-semibold text-navy-900">{product?.grade || "—"}</p>
            {product?.battery_health && <p className="text-xs text-gray-500">Bateria: {product.battery_health}%</p>}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><User className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Cliente</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <p className="text-sm font-semibold text-navy-900">{customer?.full_name || "—"}</p>
          {customer?.cpf && <p className="text-xs text-gray-500">CPF: {customer.cpf}</p>}
          {customer?.phone && <p className="text-xs text-gray-500">Tel: {customer.phone}</p>}
          {customer?.email && <p className="text-xs text-gray-500">{customer.email}</p>}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><CreditCard className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Pagamento</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Forma</p>
            <p className="text-sm font-semibold text-navy-900">{paymentLabel()}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Preço</p>
            <p className="text-sm font-semibold text-navy-900">{formatBRL(sale.sale_price)}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Data</p>
            <p className="text-sm font-semibold text-navy-900">{formatDate(sale.sale_date)}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-success-100 flex items-center justify-center"><ShieldCheck className="w-4 h-4 text-success-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Garantia</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <p className="text-sm font-semibold text-navy-900">{sale.warranty_months} meses</p>
          <p className="text-xs text-gray-500">Início: {formatDate(sale.warranty_start)}</p>
          <p className="text-xs text-gray-500">Término: {formatDate(sale.warranty_end)}</p>
        </div>
      </div>

      {checklist.length > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><FileText className="w-4 h-4 text-royal-500" /></div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Laudo de Inspeção</h3>
          </div>
          <div className="flex gap-2 mb-3">
            <Badge variant="green">{okCount} OK</Badge>
            {failCount > 0 && <Badge variant="red">{failCount} Falha{failCount > 1 ? "s" : ""}</Badge>}
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {checklist.map((item: any, idx: number) => {
              const label = checklistLabels[item.id] || item.label || item.id
              const statusLabel = item.status === "ok" ? "OK" : item.status === "fail" ? "FALHA" : item.status === "na" ? "N/A" : "—"
              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-2.5 text-xs ${
                    item.status === "ok"
                      ? "bg-success-100/20 border-success-500/20"
                      : item.status === "fail"
                      ? "bg-danger-100/20 border-danger-500/20"
                      : "bg-gray-50 border-gray-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-navy-900 flex-1">{label}</span>
                    <span className={`font-bold ml-2 ${
                      item.status === "ok" ? "text-success-600" :
                      item.status === "fail" ? "text-danger-600" :
                      "text-gray-400"
                    }`}>{statusLabel}</span>
                  </div>
                  {item.note && <p className="text-danger-500 mt-1">{item.note}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sale.notes && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-warning-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-warning-500" /></div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Observações</h3>
          </div>
          <p className="text-sm text-gray-600">{sale.notes}</p>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <h3 className="font-display font-bold text-navy-900 mb-4 font-syne">Documentos para Cliente</h3>
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
              <p className="font-semibold text-navy-900">Laudo de Inspeção</p>
              <p className="text-xs text-gray-400">Checklist completo do aparelho</p>
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
              <p className="font-semibold text-navy-900">Certificado de Garantia</p>
              <p className="text-xs text-gray-400">Termos, cobertura e cuidados</p>
            </div>
          </Button>
        </div>
      </div>
    </div>
  )
}
