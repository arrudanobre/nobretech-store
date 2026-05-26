import { ImageResponse } from "next/og"
import { loadOgFonts } from "@/lib/og/fonts"

export const runtime = "nodejs"
export const alt = "Portal de Transparência Nobretech Store"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function PortalOpenGraphImage() {
  const { syne700, syne800, inter400, inter500 } = await loadOgFonts()

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
          background: "linear-gradient(135deg, #040608 0%, #08101A 55%, #050709 100%)",
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
              "radial-gradient(circle at 78% 24%, rgba(120,170,255,0.12) 0%, rgba(120,170,255,0) 55%), radial-gradient(circle at 22% 80%, rgba(214,168,79,0.12) 0%, rgba(214,168,79,0) 55%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "28px",
            border: "1px solid rgba(214,168,79,0.15)",
            borderRadius: "32px",
            display: "flex",
          }}
        />

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
            Nobretech Store
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "48px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "168px",
              height: "168px",
              borderRadius: "36px",
              border: "1.5px solid rgba(214,168,79,0.55)",
              background: "linear-gradient(135deg, rgba(214,168,79,0.16), rgba(214,168,79,0.02))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 70px rgba(214,168,79,0.18)",
            }}
          >
            <svg
              width="96"
              height="96"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F2D88A"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div
              style={{
                fontFamily: "Syne",
                fontSize: "67px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                color: "#FFFFFF",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span>Portal de</span>
              <span style={{ color: "#F4D57A" }}>Transparência</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                marginTop: "4px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "1.5px",
                  background: "linear-gradient(90deg, #F2D88A, rgba(242,216,138,0))",
                  display: "flex",
                }}
              />
              <div
                style={{
                  fontFamily: "Inter",
                  fontSize: "26px",
                  color: "#F4D57A",
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                }}
              >
                Pedido, garantia e procedência em um só lugar.
              </div>
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: "22px",
                color: "rgba(244,244,245,0.65)",
                maxWidth: "780px",
                lineHeight: 1.4,
                marginTop: "4px",
              }}
            >
              Acompanhe os dados do seu pedido com segurança.
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
          <span>Acesso seguro · Documentos · Garantia</span>
          <span style={{ color: "#F2D88A", letterSpacing: "0.04em", textTransform: "none" }}>
            nobretechstore.com.br
          </span>
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
