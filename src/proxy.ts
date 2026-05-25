import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedPageRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/estoque(.*)",
  "/vendas(.*)",
  "/clientes(.*)",
  "/financeiro(.*)",
  "/garantias(.*)",
  "/fornecedores(.*)",
  "/configuracoes(.*)",
  "/avaliacao(.*)",
  "/precos-fornecedor(.*)",
  "/problemas(.*)",
  "/cotacoes(.*)",
  "/historico(.*)",
  "/crm(.*)",
  "/revendedores(.*)",
  "/revendedor(.*)",
  "/vitrine(.*)",
])

// All /api/* routes require authentication by default.
// Add routes here only when they must be publicly accessible without Clerk.
const isPublicApiRoute = createRouteMatcher([
  "/api/public(.*)",
])

export default clerkMiddleware(async (auth, req) => {
  const { isAuthenticated, redirectToSignIn } = await auth()

  const isApiRoute = req.nextUrl.pathname.startsWith("/api/")
  if (isApiRoute && !isPublicApiRoute(req) && !isAuthenticated) {
    return Response.json(
      { data: null, error: { message: "Unauthorized" } },
      { status: 401 }
    )
  }

  if (isProtectedPageRoute(req) && !isAuthenticated) {
    return redirectToSignIn({ returnBackUrl: req.url })
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
