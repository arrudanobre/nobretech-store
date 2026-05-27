import { ImageResponse } from "next/og"
import { loadOgFonts } from "@/lib/og/fonts"
import { getCatalogCompanyIdentity, buildCatalogLocationLabel } from "@/lib/catalog/company-identity"

export const runtime = "nodejs"
export const alt = "Catálogo da loja"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function CatalogOpenGraphImage() {
  const [{ syne700, syne800, inter400, inter500 }, identity] = await Promise.all([
    loadOgFonts(),
    getCatalogCompanyIdentity(),
  ])

  const brandName = identity.shortName
  const eyebrow = `${identity.displayName} · Catálogo`
  const location = buildCatalogLocationLabel(identity)
  const supportLine = location
    ? `Atendimento pelo WhatsApp e entrega presencial em ${identity.city ?? location}.`
    : "Atendimento pelo canal configurado."
  const domainLine =
    identity.canonicalDomain?.replace(/^https?:\/\//, "").replace(/\/+$/, "")
      ? `${identity.canonicalDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/catalogo`
      : ""

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
          background: "linear-gradient(135deg, #050607 0%, #0A0C10 50%, #050608 100%)",
          color: "#F4F4F5",
          position: "relative",
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 16% 18%, rgba(214,168,79,0.22) 0%, rgba(214,168,79,0) 50%), radial-gradient(circle at 84% 84%, rgba(120,150,200,0.10) 0%, rgba(120,150,200,0) 55%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "28px",
            border: "1px solid rgba(214,168,79,0.18)",
            borderRadius: "32px",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: "120px",
            right: "92px",
            display: "flex",
            gap: "18px",
            zIndex: 0,
            opacity: 0.42,
          }}
        >
          <div
            style={{
              width: "150px",
              height: "210px",
              borderRadius: "22px",
              border: "1px solid rgba(255,255,255,0.10)",
              background:
                "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
              display: "flex",
            }}
          />
          <div
            style={{
              width: "150px",
              height: "210px",
              borderRadius: "22px",
              border: "1px solid rgba(214,168,79,0.22)",
              background:
                "linear-gradient(160deg, rgba(214,168,79,0.10), rgba(214,168,79,0.02))",
              display: "flex",
              marginTop: "26px",
            }}
          />
          <div
            style={{
              width: "150px",
              height: "210px",
              borderRadius: "22px",
              border: "1px solid rgba(255,255,255,0.08)",
              background:
                "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.005))",
              display: "flex",
              marginTop: "12px",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontFamily: "Syne",
              fontSize: "18px",
              letterSpacing: "0.42em",
              color: "#F2D88A",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            {eyebrow}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "26px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontFamily: "Syne",
              fontSize: "90px",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#FFFFFF",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Catálogo</span>
            <span style={{ color: "#F4D57A" }}>{brandName}.</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginTop: "8px",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "1.5px",
                background: "linear-gradient(90deg, #F2D88A, rgba(242,216,138,0))",
                display: "flex",
              }}
            />
            <div
              style={{
                fontFamily: "Inter",
                fontSize: "28px",
                color: "rgba(244,244,245,0.78)",
                lineHeight: 1.4,
                maxWidth: "920px",
                fontWeight: 400,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span>Aparelhos selecionados. Fotos reais nos seminovos.</span>
              <span style={{ color: "rgba(244,244,245,0.55)", fontSize: "22px", marginTop: "6px" }}>
                {supportLine}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 1,
            fontFamily: "Inter",
            fontSize: "18px",
            color: "rgba(244,244,245,0.50)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          <span>Fotos reais · Garantia · Pronta entrega</span>
          {domainLine ? (
            <span style={{ color: "#F2D88A", letterSpacing: "0.04em", textTransform: "none" }}>
              {domainLine}
            </span>
          ) : null}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Syne", data: syne700, weight: 700, style: "normal" },
        { name: "Syne", data: syne800, weight: 800, style: "normal" },
        { name: "Inter", data: inter400, weight: 400, style: "normal" },
        { name: "Inter", data: inter500, weight: 500, style: "normal" },
      ],
    },
  )
}
