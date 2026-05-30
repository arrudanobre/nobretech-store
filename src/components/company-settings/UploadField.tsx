"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
  label: string
  description?: string
  slot: "logo" | "favicon" | "og"
  value: string | null | undefined
  onChange: (url: string) => void
  onClear: () => void
  disabled?: boolean
  // Apenas presentational: define proporções da prévia.
  aspect?: "square" | "wide"
}

export function UploadField({
  label,
  description,
  slot,
  value,
  onChange,
  onClear,
  disabled = false,
  aspect = "square",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function handleFile(file: File) {
    if (uploading || removing) return
    const fd = new FormData()
    fd.append("slot", slot)
    fd.append("file", file)
    setUploading(true)
    try {
      const res = await fetch("/api/brand-asset", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error?.message || "Erro ao enviar imagem.")
      }
      onChange(json.data.url as string)
      toast.success("Imagem enviada.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleRemove() {
    if (uploading || removing) return
    setRemoving(true)
    try {
      // Limpa objeto físico do R2 (key estável) e o campo persistido.
      await fetch("/api/brand-asset", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot }),
      })
      onClear()
      toast.success("Imagem removida.")
    } catch {
      // Mesmo se o R2 falhar, limpa o campo no formulário; o save subsequente
      // persiste URL vazia. Não bloqueia a tela.
      onClear()
    } finally {
      setRemoving(false)
    }
  }

  const wrapperRatio = aspect === "wide" ? "aspect-[1200/630]" : "aspect-square"
  const isBusy = uploading || removing

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          {description ? <p className="mt-0.5 text-xs text-slate-400">{description}</p> : null}
        </div>
      </div>

      <div
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 ${wrapperRatio}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label} className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-500">
            <ImageIcon className="h-7 w-7" />
            <span className="text-[11px] uppercase tracking-wider">sem imagem</span>
          </div>
        )}
        {isBusy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isBusy}
        >
          <Upload className="h-4 w-4" />
          {value ? "Trocar imagem" : "Enviar imagem"}
        </Button>
        {value ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={disabled || isBusy}
          >
            <Trash2 className="h-4 w-4" />
            Remover
          </Button>
        ) : null}
      </div>
    </div>
  )
}
