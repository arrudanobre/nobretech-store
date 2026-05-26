import { ImageResponse } from "next/og"

export const runtime = "nodejs"
export const alt = "Catálogo Nobretech Store"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function CatalogOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #050607 0%, #0B0D11 50%, #060709 100%)",
          color: "#F4F4F5",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 22% 22%, rgba(214,168,79,0.18) 0%, rgba(214,168,79,0) 55%), radial-gradient(circle at 80% 78%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 60%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "24px",
            border: "1px solid rgba(214,168,79,0.18)",
            borderRadius: "28px",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "16px", zIndex: 1 }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #D6A84F, #E7C16A)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#160F05",
              fontSize: "26px",
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            N
          </div>
          <div
            style={{
              fontSize: "16px",
              letterSpacing: "0.32em",
              color: "#F2D88A",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Nobretech Store · Catálogo
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px", zIndex: 1 }}>
          <div
            style={{
              fontSize: "116px",
              fontWeight: 800,
              letterSpacing: "-0.045em",
              lineHeight: 1,
              color: "#FFFFFF",
            }}
          >
            Catálogo oficial
          </div>
          <div
            style={{
              fontSize: "36px",
              fontWeight: 500,
              color: "#F4D57A",
              letterSpacing: "-0.01em",
            }}
          >
            iPhone, iPad, Mac e mais.
          </div>
          <div
            style={{
              fontSize: "26px",
              color: "rgba(244,244,245,0.72)",
              maxWidth: "920px",
              lineHeight: 1.35,
            }}
          >
            Aparelhos disponíveis com fotos reais nos seminovos, garantia e atendimento pelo WhatsApp.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 1,
            fontSize: "18px",
            color: "rgba(244,244,245,0.55)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          <span>Fotos reais · Garantia · Pronta entrega</span>
          <span style={{ color: "#F2D88A" }}>nobretechstore.com.br/catalogo</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
