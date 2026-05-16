import { NextResponse } from "next/server"
import { canAccess, requireApiAuthContext } from "@/lib/auth-context"
import {
  buildInventoryReport,
  buildInventoryReportWorkbook,
  parseInventoryReportRequest,
} from "@/lib/reports/inventory-report"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  if (!canAccess(authResult.context.role, "finance.view")) {
    return NextResponse.json(
      { data: null, error: { message: "Sem permissão para acessar relatórios financeiros." } },
      { status: 403 }
    )
  }

  try {
    const { filters, format } = parseInventoryReportRequest(request.url)
    const report = await buildInventoryReport(authResult.context.companyId, filters)

    if (format === "xlsx") {
      const buffer = await buildInventoryReportWorkbook(report)
      const filename = `relatorio-estoque-custo-${filters.startDate}-a-${filters.endDate}.xlsx`

      return new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      })
    }

    return NextResponse.json({
      data: {
        filters: report.filters,
        summary: report.summary,
        rows: report.previewRows,
        previewLimit: report.previewLimit,
        totalRows: report.rows.length,
        filterOptions: report.filterOptions,
      },
      error: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar relatório de estoque."
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 400 }
    )
  }
}
