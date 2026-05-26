import { ImageResponse } from "next/og"

export const runtime = "nodejs"
export const alt = "Portal de Transparência Nobretech Store"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function PortalOpenGraphImage() {
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
          background: "linear-gradient(135deg, #040608 0%, #0A0F14 55%, #050709 100%)",
          color: "#F4F4F5",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 78% 26%, rgba(120,180,255,0.10) 0%, rgba(120,180,255,0) 55%), radial-gradient(circle at 22% 78%, rgba(214,168,79,0.10) 0%, rgba(214,168,79,0) 60%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "24px",
            border: "1px solid rgba(214,168,79,0.15)",
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
            Nobretech Store
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "44px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "168px",
              height: "168px",
              borderRadius: "32px",
              border: "1.5px solid rgba(214,168,79,0.55)",
              background:
                "linear-gradient(135deg, rgba(214,168,79,0.18), rgba(214,168,79,0.04))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 60px rgba(214,168,79,0.18)",
            }}
          >
            <svg
              width="92"
              height="92"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F2D88A"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                fontSize: "78px",
                fontWeight: 800,
                letterSpacing: "-0.035em",
                lineHeight: 1,
                color: "#FFFFFF",
              }}
            >
              Portal de Transparência
            </div>
            <div
              style={{
                fontSize: "32px",
                fontWeight: 500,
                color: "#F4D57A",
                letterSpacing: "-0.005em",
              }}
            >
              Compra verificada. Garantia. Procedência.
            </div>
            <div
              style={{
                fontSize: "22px",
                color: "rgba(244,244,245,0.70)",
                maxWidth: "760px",
                lineHeight: 1.35,
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
            fontSize: "18px",
            color: "rgba(244,244,245,0.55)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          <span>Acesso seguro · Documentos · Garantia</span>
          <span style={{ color: "#F2D88A" }}>nobretechstore.com.br</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
