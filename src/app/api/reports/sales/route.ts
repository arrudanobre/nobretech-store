import { NextResponse } from "next/server"
import { canAccess, requireApiAuthContext } from "@/lib/auth-context"
import {
  buildSalesReport,
  buildSalesReportWorkbook,
  parseSalesReportRequest,
} from "@/lib/reports/sales-report"

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
    const { filters, format } = parseSalesReportRequest(request.url)
    const report = await buildSalesReport(authResult.context.companyId, filters)

    if (format === "xlsx") {
      const buffer = await buildSalesReportWorkbook(report)
      const filename = `relatorio-vendas-contador-${filters.startDate}-a-${filters.endDate}.xlsx`

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
    const message = error instanceof Error ? error.message : "Erro ao gerar relatório de vendas."
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 400 }
    )
  }
}

