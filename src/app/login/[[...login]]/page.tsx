import { SignIn } from "@clerk/nextjs"
import { Orbitron } from "next/font/google"
import { Lock, ShieldCheck } from "lucide-react"

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
})

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050b14] px-4 py-8 text-white sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(47,109,246,0.16),transparent_34%),radial-gradient(circle_at_20%_70%,rgba(36,88,180,0.12),transparent_32%),linear-gradient(135deg,#020712_0%,#06111f_45%,#020712_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(135deg,transparent_0_45%,rgba(47,109,246,0.12)_46%,transparent_47%),radial-gradient(circle,rgba(72,125,255,0.22)_1px,transparent_1px)] [background-position:-120px_40px,right_80px] [background-size:420px_420px,22px_22px]" />

      <div className="relative z-10 flex w-full flex-col items-center">
      <section className="relative w-full max-w-[820px] rounded-[28px] border border-[#7497cf61] bg-[linear-gradient(180deg,rgba(13,28,48,0.94),rgba(5,14,26,0.96))] px-5 py-8 shadow-[0_32px_90px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.04)] after:absolute after:bottom-[-1px] after:left-1/2 after:h-[3px] after:w-[190px] after:-translate-x-1/2 after:rounded-full after:bg-[linear-gradient(90deg,transparent,#2f6df6,transparent)] after:shadow-[0_0_28px_rgba(47,109,246,0.45)] sm:rounded-[34px] sm:px-14 sm:py-10">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-5 grid h-[82px] w-[82px] place-items-center text-[#3f74ff] [clip-path:polygon(25%_7%,75%_7%,100%_50%,75%_93%,25%_93%,0_50%)] bg-[linear-gradient(180deg,rgba(24,47,86,0.34),rgba(4,14,28,0.12))] ring-1 ring-[#32486e]/70 shadow-[0_0_42px_rgba(47,109,246,0.22)] sm:mb-7">
            <span className={`${orbitron.className} text-[42px] font-black leading-none tracking-normal`}>
              N
            </span>
          </div>
          <h1 className={`${orbitron.className} m-0 text-[34px] font-black uppercase leading-[0.95] tracking-[0.08em] text-[#f7f9ff] [text-shadow:0_0_26px_rgba(255,255,255,0.08)] sm:text-[52px]`}>
            NOBRETECH
            <span className="mt-3 block translate-x-[0.28em] text-[18px] tracking-[0.58em] text-[#4e7cff] sm:text-[25px]">
              STORE
            </span>
          </h1>
          <p className="mt-5 text-base font-medium tracking-normal text-[#9aa7bc] sm:text-[19px]">
            Acesso seguro ao sistema de gestão
          </p>
        </div>

        <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[24px] border border-[rgba(116,151,207,0.22)] bg-[linear-gradient(180deg,rgba(9,24,43,0.94),rgba(6,17,31,0.98))] shadow-[0_22px_70px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.03)] sm:rounded-[28px]">
          <div className="nobretech-clerk flex justify-center px-5 pb-7 pt-7 sm:px-12 sm:pb-8 sm:pt-9">
            <SignIn
              path="/login"
              routing="path"
              signUpUrl="/login"
              forceRedirectUrl="/dashboard"
              appearance={{
                variables: {
                  colorPrimary: "#2f6df6",
                  colorBackground: "transparent",
                  colorInputBackground: "rgba(2, 9, 18, 0.55)",
                  colorInputText: "#F7F9FF",
                  colorText: "#F7F9FF",
                  colorTextSecondary: "#BDC8DA",
                  colorNeutral: "#9AA7BC",
                  borderRadius: "0.875rem",
                },
                elements: {
                  rootBox: "w-full",
                  cardBox: "w-full shadow-none",
                  card: "w-full border-0 bg-transparent p-0 shadow-none",
                  headerTitle: "font-sans text-2xl font-extrabold tracking-[-0.03em] text-white sm:text-[30px]",
                  headerSubtitle: "text-base text-[#bdc8da] sm:text-lg",
                  socialButtonsBlockButton:
                    "h-14 w-full rounded-[14px] border border-white/20 bg-white/5 text-base font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-white/10 sm:h-16 sm:text-xl",
                  socialButtonsBlockButtonText: "text-white",
                  dividerLine: "bg-white/10",
                  dividerText: "px-4 text-sm text-[#9aa7bc]",
                  formFieldLabel: "mb-3 text-[17px] font-semibold text-[#cdd6e6]",
                  formFieldInput:
                    "h-[60px] rounded-[14px] border border-white/20 bg-[rgba(2,9,18,0.55)] text-lg text-white shadow-none placeholder:text-[#8b96a8] focus:border-[#78a2ff] focus:ring-2 focus:ring-[#2f6df6]/25",
                  formButtonPrimary:
                    "h-[60px] rounded-[15px] bg-[linear-gradient(135deg,#2e6df6,#1d4eff)] text-lg font-extrabold text-white shadow-[0_16px_38px_rgba(36,88,246,0.35),inset_0_1px_0_rgba(255,255,255,0.22)] hover:brightness-110 sm:h-[68px] sm:text-[22px]",
                  footer: "text-[#bdc8da]",
                  footerAction: "mt-8 text-base sm:text-lg",
                  footerActionText: "text-[#bdc8da]",
                  footerActionLink: "font-bold text-[#4e8cff] hover:text-[#78a2ff]",
                  footerPagesLink: "text-[#4e8cff] hover:text-[#78a2ff]",
                  organizationSwitcherTrigger: "text-white",
                  organizationPreviewTextContainer: "text-white",
                  organizationPreviewMainIdentifier: "text-white",
                  organizationPreviewSecondaryIdentifier: "text-[#bdc8da]",
                  organizationListCreateOrganizationActionButton: "text-white hover:bg-white/5",
                  organizationListCreateOrganizationActionText: "text-white",
                  organizationListCreateOrganizationActionIcon: "text-[#bdc8da]",
                  organizationListPreviewButton: "text-white hover:bg-white/5",
                  organizationListPreviewText: "text-white",
                  organizationListPreviewMainIdentifier: "text-white",
                  taskChooseOrganizationFooter: "text-[#bdc8da]",
                },
              }}
            />
          </div>

          <footer className="flex items-center justify-center gap-4 border-t border-white/10 bg-white/[0.01] px-6 py-6 text-[#95a7c9] sm:px-10 sm:py-7">
            <ShieldCheck className="h-6 w-6 shrink-0 text-[#78a2ff]" />
            <div className="text-sm sm:text-[17px]">
              <strong className="mb-1 block font-bold text-[#aebee3]">
                Seus dados estão protegidos
              </strong>
              Conexão segura e criptografada
            </div>
          </footer>
        </div>

        <style>{`
          .nobretech-clerk .cl-rootBox,
          .nobretech-clerk .cl-cardBox,
          .nobretech-clerk .cl-card {
            width: 100% !important;
            background: transparent !important;
          }

          .nobretech-clerk .cl-card {
            border: 0 !important;
            box-shadow: none !important;
            color: #f8fafc !important;
          }

          .nobretech-clerk .cl-main {
            border: 0 !important;
            box-shadow: none !important;
            gap: 0 !important;
          }

          .nobretech-clerk .cl-header {
            margin-bottom: 1.65rem !important;
          }

          .nobretech-clerk .cl-headerTitle,
          .nobretech-clerk .cl-taskChooseOrganizationTitle,
          .nobretech-clerk .cl-organizationPreviewMainIdentifier,
          .nobretech-clerk .cl-organizationListCreateOrganizationActionText,
          .nobretech-clerk .cl-organizationListPreviewText,
          .nobretech-clerk .cl-formFieldLabel {
            color: #f8fafc !important;
          }

          .nobretech-clerk .cl-headerSubtitle,
          .nobretech-clerk .cl-taskChooseOrganizationSubtitle,
          .nobretech-clerk .cl-organizationPreviewSecondaryIdentifier,
          .nobretech-clerk .cl-footer,
          .nobretech-clerk .cl-footerActionText {
            color: #cbd5e1 !important;
          }

          .nobretech-clerk .cl-organizationListPreviewButton,
          .nobretech-clerk .cl-organizationListCreateOrganizationActionButton {
            color: #f8fafc !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
          }

          .nobretech-clerk .cl-organizationListPreviewButton:hover,
          .nobretech-clerk .cl-organizationListCreateOrganizationActionButton:hover {
            background: rgba(255, 255, 255, 0.06) !important;
          }

          .nobretech-clerk .cl-footerActionLink,
          .nobretech-clerk .cl-footerPagesLink {
            color: #4e8cff !important;
          }

          .nobretech-clerk .cl-socialButtonsRoot {
            margin-top: 0 !important;
            margin-bottom: 1.55rem !important;
          }

          .nobretech-clerk .cl-socialButtonsBlockButton {
            position: relative !important;
            width: 100% !important;
            min-width: 100% !important;
            height: 4rem !important;
            padding: 0 1.75rem !important;
            background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)) !important;
            border: 1px solid rgba(154, 167, 188, 0.28) !important;
            color: #ffffff !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .nobretech-clerk .cl-socialButtonsBlockButton__google::before {
            content: "";
            position: absolute;
            left: calc(50% - 7.3rem);
            width: 1.75rem;
            height: 1.75rem;
            min-width: 1.75rem;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23FFC107' d='M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z'/%3E%3Cpath fill='%23FF3D00' d='m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z'/%3E%3Cpath fill='%234CAF50' d='M24 44c5.2 0 10-2 13.5-5.3l-6.2-5.2C29.3 35.1 26.8 36 24 36c-5.2 0-9.7-3.3-11.3-7.9l-6.6 5.1C9.4 39.6 16.1 44 24 44z'/%3E%3Cpath fill='%231976D2' d='M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.3 4.3-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z'/%3E%3C/svg%3E");
            background-position: center;
            background-repeat: no-repeat;
            background-size: contain;
            display: inline-block;
          }

          .nobretech-clerk .cl-socialButtonsBlockButtonText {
            display: inline !important;
            color: #ffffff !important;
          }

          .nobretech-clerk .cl-socialButtonsProviderIcon {
            display: none !important;
          }

          .nobretech-clerk .cl-dividerRow {
            margin: 1.55rem 0 1.5rem !important;
          }

          .nobretech-clerk .cl-dividerLine {
            background: linear-gradient(90deg, transparent, rgba(154,167,188,0.24), transparent) !important;
          }

          .nobretech-clerk .cl-formField {
            position: relative !important;
            margin-bottom: 1.5rem !important;
          }

          .nobretech-clerk .cl-formFieldInputShowPasswordButton,
          .nobretech-clerk .cl-formFieldInputShowPasswordIcon {
            color: #c7d2e4 !important;
          }

          .nobretech-clerk .cl-formFieldInput {
            color: #ffffff !important;
            background-color: rgba(2, 9, 18, 0.55) !important;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6h16v12H4V6Z' stroke='%23c7d2e4' stroke-width='2'/%3E%3Cpath d='m4 7 8 6 8-6' stroke='%23c7d2e4' stroke-width='2'/%3E%3C/svg%3E") !important;
            background-position: 1.15rem center !important;
            background-repeat: no-repeat !important;
            background-size: 1.35rem !important;
            padding-left: 3.35rem !important;
            padding-right: 1.25rem !important;
          }

          .nobretech-clerk .cl-formFieldInput::placeholder {
            color: #9ca8bc !important;
            opacity: 1 !important;
          }

          .nobretech-clerk .cl-dividerText {
            color: #cbd5e1 !important;
          }

          .nobretech-clerk .cl-formButtonPrimary {
            position: relative !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 1rem !important;
          }

          .nobretech-clerk .cl-formButtonPrimary svg {
            display: none !important;
          }

          .nobretech-clerk .cl-footer {
            display: none !important;
          }
        `}</style>
      </section>
      {process.env.NODE_ENV === "development" ? (
        <div className="mt-9 inline-flex items-center gap-3 rounded-full border border-[#2f6df65c] bg-[#2f6df614] px-6 py-3 text-base font-bold text-[#2f6df6]">
          <Lock className="h-5 w-5" />
          Development mode
        </div>
      ) : null}
      </div>
    </main>
  )
}
