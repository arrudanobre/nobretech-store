import { PAYMENT_METHODS } from '@/lib/constants'
import type { FinancialSettings } from '@/types/database'

/** Get fee key from payment method value */
export function getFeeKey(method: string): string {
  const map: Record<string, string> = {
    pix: 'pix',
    cash: 'cash',
    debit: 'debit',
    credit_1x: 'credit_1x',
    credit_2x: 'credit_2x',
    credit_3x: 'credit_3x',
    credit_4x: 'credit_4x',
    credit_5x: 'credit_5x',
    credit_6x: 'credit_6x',
    credit_7x: 'credit_7x',
    credit_8x: 'credit_8x',
    credit_9x: 'credit_9x',
    credit_10x: 'credit_10x',
    credit_11x: 'credit_11x',
    credit_12x: 'credit_12x',
  }
  return map[method] ?? 'pix'
}

/** Calculate price needed to net target amount after fees */
export function calcPrice(target: number, feePct: number): number {
  if (feePct >= 100) return Infinity
  const net = target / (1 - feePct / 100)
  return Math.ceil(net) // arredonda para cima
}

/** Build full price table for all payment methods */
export function buildPriceTable(cost: number, marginPct: number, settings: Partial<FinancialSettings>) {
  const targetNet = calcPrice(cost, marginPct)

  return PAYMENT_METHODS.map((m) => {
    const feeKey = getFeeKey(m.value)
    const fee = Number((settings as any)[feeKey] ?? 0)
    const price = fee > 0 ? calcPrice(targetNet, fee) : targetNet
    const installments = m.maxInstallments > 1 ? m.maxInstallments : 1
    const installmentValue = price / installments

    return {
      method: m.value,
      label: m.label,
      price,
      fee,
      netAmount: targetNet,
      installments,
      installmentValue,
    }
  })
}

/** Calculate profit from sale */
export function calcProfit(salePrice: number, costPrice: number, feePct: number): number {
  const fee = salePrice * (feePct / 100)
  return salePrice - fee - costPrice
}

/** Format BRL currency */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/** Format date pt-BR */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

/** Calculate days between dates */
export function daysBetween(from: string, to: string = new Date().toISOString()): number {
  const diff = new Date(to).getTime() - new Date(from).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/** Mask CPF */
export function maskCPF(value: string): string {
  const nums = value.replace(/\D/g, '').slice(0, 11)
  if (nums.length <= 3) return nums
  if (nums.length <= 6) return `${nums.slice(0, 3)}.${nums.slice(3)}`
  if (nums.length <= 9) return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6)}`
  return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6, 9)}-${nums.slice(9)}`
}

/** Validate CPF */
export function validateCPF(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, '')
  if (nums.length !== 11) return false
  if (/^(\d)\1{10}$/.test(nums)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(nums[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== parseInt(nums[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(nums[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== parseInt(nums[10])) return false

  return true
}

/** Format phone */
export function formatPhone(value: string): string {
  const nums = value.replace(/\D/g, '').slice(0, 11)
  if (nums.length <= 2) return nums.length ? `(${nums}` : ''
  if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
}

/** Mask IMEI */
export function maskIMEI(value: string): string {
  return value.replace(/\D/g, '').slice(0, 15)
}

/** Luhn algorithm for IMEI validation */
export function validateIMEI(imei: string): boolean {
  const nums = imei.replace(/\D/g, '')
  if (nums.length !== 15) return false

  let sum = 0
  for (let i = 0; i < 14; i++) {
    let d = parseInt(nums[i])
    if (i % 2 !== 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  const check = (10 - (sum % 10)) % 10
  return check === parseInt(nums[14])
}

/** Generate PDF-ready HTML for checklist */
export function renderChecklistHTML(data: {
  productName: string
  imei: string
  serial: string
  grade: string
  date: string
  items: Array<{ label: string; status: string; note?: string }>
  battery?: number
  iosVersion?: string
}) {
  const statusIcon = (s: string) => {
    if (s === 'ok') return '<span style="color:#22c55e;font-weight:bold;">&#10004; OK</span>'
    if (s === 'fail') return '<span style="color:#ef4444;font-weight:bold;">&#10008; FALHA</span>'
    return '<span style="color:#9ca3af;">&#8212; N/A</span>'
  }

  const rows = data.items
    .map(
      (item) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px 12px; font-size:13px;">${item.label}</td>
      <td style="padding:8px 12px; font-size:13px; text-align:center;">${statusIcon(item.status)}</td>
      <td style="padding:8px 12px; font-size:13px; color:#6b7280;">${item.note || ''}</td>
    </tr>
  `
    )
    .join('')

  return `
    <div style="font-family:Inter,system-ui,sans-serif; max-width:700px; margin:auto; padding:24px;">
      <div style="text-align:center; margin-bottom:24px;">
        <h1 style="color:#0D1B2E; font-size:22px; margin-bottom:4px;">NOBRETECH STORE</h1>
        <h2 style="color:#3A6BC4; font-size:16px; margin:0;">Laudo de Inspeção de Aparelho</h2>
      </div>

      <div style="background:#f9fafb; border-radius:8px; padding:16px; margin-bottom:16px; font-size:13px;">
        <strong>Produto:</strong> ${data.productName}<br/>
        <strong>IMEI:</strong> ${data.imei}<br/>
        <strong>Nº Série:</strong> ${data.serial}<br/>
        <strong>Grade:</strong> ${data.grade}<br/>
        ${data.battery ? `<strong>Bateria:</strong> ${data.battery}%<br/>` : ''}
        ${data.iosVersion ? `<strong>Software:</strong> ${data.iosVersion}<br/>` : ''}
        <strong>Data:</strong> ${data.date}
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:#0D1B2E; color:white;">
            <th style="padding:8px 12px; text-align:left; border-radius:4px 0 0 0;">Item</th>
            <th style="padding:8px 12px; text-align:center;">Status</th>
            <th style="padding:8px 12px; text-align:left; border-radius:0 4px 0 0;">Observação</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top:32px; text-align:center; font-size:12px; color:#9ca3af;">
        <p>NOBRETECH STORE — Laudo gerado em ${data.date}</p>
        <p>Documento válido como comprovação de estado do aparelho.</p>
      </div>
    </div>
  `
}

/** Generate PDF-ready HTML for warranty */
export function renderWarrantyHTML(data: {
  companyName: string
  customerName: string
  productName: string
  imei: string
  saleDate: string
  warrantyStart: string
  warrantyEnd: string
  warrantyMonths: number
}) {
  return `
    <div style="font-family:Inter,system-ui,sans-serif; max-width:700px; margin:auto; padding:24px;">
      <div style="text-align:center; margin-bottom:24px;">
        <h1 style="color:#0D1B2E; font-size:22px; margin-bottom:4px;">NOBRETECH STORE</h1>
        <h2 style="color:#3A6BC4; font-size:16px; margin:0;">Termo de Garantia</h2>
      </div>

      <div style="background:#f0f4ff; border:2px solid #3A6BC4; border-radius:8px; padding:16px; margin-bottom:16px;">
        <h3 style="margin:0 0 8px; color:#0D1B2E;">Dados da Compra</h3>
        <p style="margin:4px 0; font-size:13px;"><strong>Cliente:</strong> ${data.customerName}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>Produto:</strong> ${data.productName}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>IMEI:</strong> ${data.imei}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>Data da Compra:</strong> ${data.saleDate}</p>
      </div>

      <div style="background:#f0fdf4; border:2px solid #22c55e; border-radius:8px; padding:16px; margin-bottom:16px;">
        <h3 style="margin:0 0 8px; color:#166534;">Cobertura da Garantia</h3>
        <p style="margin:4px 0; font-size:13px;"><strong>Prazo:</strong> ${data.warrantyMonths} meses</p>
        <p style="margin:4px 0; font-size:13px;"><strong>Início:</strong> ${data.warrantyStart}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>Vencimento:</strong> ${data.warrantyEnd}</p>
      </div>

      <div style="font-size:13px; line-height:1.6; margin-bottom:16px;">
        <h3 style="color:#0D1B2E;">Termos e Condições</h3>
        <p>A ${data.companyName} concede garantia de ${data.warrantyMonths} meses a partir da data de compra, cobrindo defeitos de funcionamento que não tenham sido causados por:</p>
        <ul style="margin:8px 0;">
          <li>Quedas, impactos ou danos físicos causados pelo usuário</li>
          <li>Exposição a líquidos ou umidade</li>
          <li>Uso inadequado do aparelho</li>
          <li>Modificações de software (jailbreak)</li>
          <li>Desmontagem por terceiros não autorizados</li>
        </ul>
        <p>A garantia cobre defeitos internos de funcionamento e software. Caso o aparelho apresente algum problema coberto, o cliente deverá entrar em contato para avaliação.</p>
        <p><strong>Contato:</strong> ${data.companyName} — São Luís/MA</p>
      </div>

      <div style="margin-top:32px; text-align:center; font-size:12px; color:#9ca3af;">
        <p>NOBRETECH STORE — Termo de Garantia gerado em ${data.saleDate}</p>
      </div>
    </div>
  `
}

export function getWarrantyStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800'
    case 'expiring_soon':
      return 'bg-amber-100 text-amber-800'
    case 'expired':
      return 'bg-red-100 text-red-800'
    case 'voided':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function getProblemPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical':
      return 'border-l-red-500'
    case 'high':
      return 'border-l-orange-500'
    case 'medium':
      return 'border-l-yellow-500'
    case 'low':
      return 'border-l-green-500'
    default:
      return 'border-l-gray-300'
  }
}

export function getAIScoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500 text-white'
  if (score >= 5) return 'bg-amber-500 text-white'
  return 'bg-red-500 text-white'
}
