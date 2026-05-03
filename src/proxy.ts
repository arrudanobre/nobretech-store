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
])

const isProtectedApiRoute = createRouteMatcher(["/api/db(.*)"])

export default clerkMiddleware(async (auth, req) => {
  const { isAuthenticated, redirectToSignIn } = await auth()

  if (isProtectedApiRoute(req) && !isAuthenticated) {
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
