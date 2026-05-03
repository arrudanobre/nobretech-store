import { SignIn } from "@clerk/nextjs"
import { Smartphone } from "lucide-react"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-900/90 p-6 shadow-2xl sm:p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal-500 shadow-lg">
            <Smartphone className="h-7 w-7 text-white" />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-normal text-white sm:text-3xl">
            NOBRETECH STORE
          </h1>
          <p className="mt-2 text-sm font-medium text-white/55">
            Acesso seguro ao sistema de gestão
          </p>
        </div>

        <div className="nobretech-clerk flex justify-center">
          <SignIn
            path="/login"
            routing="path"
            signUpUrl="/login"
            forceRedirectUrl="/dashboard"
            appearance={{
              variables: {
                colorPrimary: "#3A6BC4",
                colorBackground: "#0D1B2E",
                colorInputBackground: "#FFFFFF",
                colorInputText: "#0D1B2E",
                colorText: "#F8FAFC",
                colorTextSecondary: "#CBD5E1",
                colorNeutral: "#94A3B8",
                borderRadius: "0.75rem",
              },
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card:
                  "w-full border border-white/10 bg-navy-900 p-5 shadow-none sm:p-6",
                headerTitle: "font-sans text-xl font-bold text-white",
                headerSubtitle: "text-sm text-slate-300",
                socialButtonsBlockButton:
                  "border-white/15 bg-white text-navy-900 hover:bg-slate-50",
                formFieldLabel: "text-slate-200",
                formFieldInput:
                  "border-white/15 bg-white text-navy-900 placeholder:text-slate-400",
                formButtonPrimary:
                  "bg-royal-500 text-sm font-semibold hover:bg-royal-600",
                footer: "text-slate-300",
                footerActionText: "text-slate-300",
                footerActionLink: "text-royal-400 hover:text-royal-300",
                organizationSwitcherTrigger: "text-white",
                organizationPreviewTextContainer: "text-white",
                organizationPreviewMainIdentifier: "text-white",
                organizationPreviewSecondaryIdentifier: "text-slate-300",
                organizationListCreateOrganizationActionButton:
                  "text-white hover:bg-white/5",
                organizationListCreateOrganizationActionText: "text-white",
                organizationListCreateOrganizationActionIcon: "text-slate-200",
                organizationListPreviewButton:
                  "text-white hover:bg-white/5",
                organizationListPreviewText: "text-white",
                organizationListPreviewMainIdentifier: "text-white",
                taskChooseOrganizationFooter: "text-slate-300",
                footerPagesLink: "text-royal-400 hover:text-royal-300",
              },
            }}
          />
        </div>

        <style>{`
          .nobretech-clerk .cl-card {
            background: #0d1b2e !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
            color: #f8fafc !important;
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
            color: #60a5fa !important;
          }

          .nobretech-clerk .cl-socialButtonsBlockButton,
          .nobretech-clerk .cl-formFieldInput {
            color: #0d1b2e !important;
          }
        `}</style>
      </section>
    </main>
  )
}
