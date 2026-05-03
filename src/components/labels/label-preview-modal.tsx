"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, Download, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  LABEL_HEIGHT_MM,
  LABEL_HEIGHT_PX,
  LABEL_WIDTH_MM,
  LABEL_WIDTH_PX,
  type InventoryStockLabelData,
  type VerifiedPurchaseCustomerLabelData,
} from "@/lib/label-utils"
import {
  downloadPng,
  renderInventoryStockLabelPng,
  renderVerifiedPurchaseCustomerLabelPng,
} from "@/components/labels/label-canvas"

type LabelPreviewModalProps = {
  title: string
  copyText: string
  fileName: string
  children: (onReady: (dataUrl: string) => void) => React.ReactNode
  onClose: () => void
}

export function LabelPreviewModal({ title, copyText, fileName, children, onClose }: LabelPreviewModalProps) {
  const [copied, setCopied] = useState(false)
  const [dataUrl, setDataUrl] = useState("")

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div>
            <h3 className="font-display text-base font-bold text-navy-900 font-syne">{title}</h3>
            <p className="text-xs text-gray-500">{LABEL_WIDTH_MM}x{LABEL_HEIGHT_MM} mm · {LABEL_WIDTH_PX}x{LABEL_HEIGHT_PX} px</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 sm:p-5">
          {children(setDataUrl)}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={handleCopy}>
              <Copy className="h-4 w-4" />
              {copied ? "Copiado" : "Copiar texto"}
            </Button>
            <DownloadButton fileName={fileName} dataUrl={dataUrl} />
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DownloadButton({ fileName, dataUrl }: { fileName: string; dataUrl: string }) {
  return (
    <Button
      variant="primary"
      onClick={() => dataUrl && downloadPng(dataUrl, fileName)}
      disabled={!dataUrl}
    >
      <Download className="h-4 w-4" />
      Baixar PNG
    </Button>
  )
}

function LabelImage({ dataUrl, isLoading }: { dataUrl: string; isLoading: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="mx-auto aspect-[5/3] w-full max-w-[500px] overflow-hidden rounded bg-white shadow-sm ring-1 ring-gray-200">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="Preview da etiqueta"
            className="h-full w-full object-contain"
            width={LABEL_WIDTH_PX}
            height={LABEL_HEIGHT_PX}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Preview indisponível"}
          </div>
        )}
      </div>
    </div>
  )
}

export function InventoryStockLabel({ data, onReady }: { data: InventoryStockLabelData; onReady?: (dataUrl: string) => void }) {
  const [dataUrl, setDataUrl] = useState("")
  const stableData = useMemo(() => data, [data])

  useEffect(() => {
    let active = true
    renderInventoryStockLabelPng(stableData).then((url) => {
      if (!active) return
      setDataUrl(url)
      onReady?.(url)
    })
    return () => {
      active = false
    }
  }, [stableData, onReady])

  return <LabelImage dataUrl={dataUrl} isLoading={!dataUrl} />
}

export function VerifiedPurchaseCustomerLabel({ data, onReady }: { data: VerifiedPurchaseCustomerLabelData; onReady?: (dataUrl: string) => void }) {
  const [dataUrl, setDataUrl] = useState("")
  const stableData = useMemo(() => data, [data])

  useEffect(() => {
    let active = true
    renderVerifiedPurchaseCustomerLabelPng(stableData).then((url) => {
      if (!active) return
      setDataUrl(url)
      onReady?.(url)
    })
    return () => {
      active = false
    }
  }, [stableData, onReady])

  return <LabelImage dataUrl={dataUrl} isLoading={!dataUrl} />
}
