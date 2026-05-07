"use client"

import { useRef, type MouseEvent, type SVGProps } from "react"
import Image from "next/image"
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion"

const WHATSAPP_URL = "https://wa.me/5598988265655"
const SYSTEM_URL = "/dashboard"

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 34 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const iconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

function ArrowRightIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

function CheckCircleIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 5.5-6" />
    </svg>
  )
}

function ShieldCheckIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <path d="M12 3 5 6v5c0 5 3.2 8.5 7 10 3.8-1.5 7-5 7-10V6l-7-3Z" />
      <path d="m8.8 12 2.2 2.2 5-5.2" />
    </svg>
  )
}

function SparklesIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <path d="M12 3 10.4 8.4 5 10l5.4 1.6L12 17l1.6-5.4L19 10l-5.4-1.6L12 3Z" />
      <path d="M19 15v4" />
      <path d="M21 17h-4" />
      <path d="M5 3v3" />
      <path d="M6.5 4.5h-3" />
    </svg>
  )
}

function SmartphoneIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
      <path d="M10 18h4" />
    </svg>
  )
}

function TabletIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <rect x="4" y="3" width="16" height="18" rx="2.6" />
      <path d="M11 18h2" />
    </svg>
  )
}

function LaptopIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <path d="M5 5.5h14v10H5z" />
      <path d="M3 18.5h18" />
      <path d="M8.5 18.5h7" />
    </svg>
  )
}

function MessageCircleIcon({ className = "" }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...iconProps}>
      <path d="M20 11.5a7.5 7.5 0 0 1-10.7 6.8L4 20l1.7-5A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8.5 11.5h.01" />
      <path d="M12 11.5h.01" />
      <path d="M15.5 11.5h.01" />
    </svg>
  )
}

const EXPERIENCE_CARDS = [
  {
    icon: ShieldCheckIcon,
    title: "Garantia Nobretech",
    text: "Mais tranquilidade depois da compra, com suporte direto e transparente.",
  },
  {
    icon: SparklesIcon,
    title: "Curadoria premium",
    text: "Produtos selecionados com critério, seja lacrado, acessório ou opção premium.",
  },
  {
    icon: CheckCircleIcon,
    title: "Transparência",
    text: "Comunicação clara, sem empurrar produto e sem esconder informação.",
  },
  {
    icon: MessageCircleIcon,
    title: "Atendimento humano",
    text: "Você fala com quem cuida da marca e acompanha o processo de perto.",
  },
]

const PRODUCT_CARDS = [
  {
    icon: SmartphoneIcon,
    title: "iPhone",
    text: "Modelos selecionados, com orientação clara para você comprar bem.",
  },
  {
    icon: TabletIcon,
    title: "iPad",
    text: "Lacrados e kits especiais para trabalho, estudo, criação e presente.",
  },
  {
    icon: LaptopIcon,
    title: "MacBook",
    text: "Performance, portabilidade e acabamento premium em uma compra assistida.",
  },
]

const FOUNDER_BADGES = [
  {
    title: "Curadoria",
    text: "Escolha criteriosa antes de cada oferta.",
  },
  {
    title: "Garantia",
    text: "Segurança real depois da compra.",
  },
  {
    title: "Atendimento",
    text: "Presença humana do começo ao fim.",
  },
]

export function getNobretechLandingTestData() {
  return {
    whatsappUrl: WHATSAPP_URL,
    systemUrl: SYSTEM_URL,
    experienceCardCount: EXPERIENCE_CARDS.length,
    productCardCount: PRODUCT_CARDS.length,
    hasRequiredSections: ["inicio", "vinicius", "experiencia", "produtos"].every(Boolean),
  }
}

function NoiseOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] opacity-[0.035] mix-blend-screen"
      style={{
        backgroundImage:
          "url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')",
      }}
    />
  )
}

function CinematicHero() {
  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  const glowScale = useTransform(scrollYProgress, [0, 1], [1, 1.18])
  const glowY = useTransform(scrollYProgress, [0, 1], [0, -110])
  const textY = useTransform(scrollYProgress, [0, 1], [0, -48])
  const textOpacity = useTransform(scrollYProgress, [0, 0.62, 1], [1, 0.72, 0.28])
  const textTracking = useTransform(scrollYProgress, [0, 1], ["0em", "0.018em"])
  const particleYSlow = useTransform(scrollYProgress, [0, 1], [0, -36])

  return (
    <motion.section
      ref={heroRef}
      id="inicio"
      className="relative min-h-screen overflow-hidden bg-[#050505] px-6 pb-20 pt-28 md:px-12 lg:pb-0 lg:pt-0"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_58%,rgba(55,75,130,0.18),transparent_38%),linear-gradient(180deg,#050505_0%,#030303_54%,#050505_100%)]" />
      <motion.div
        aria-hidden="true"
        style={{ y: glowY, scale: glowScale }}
        animate={{ opacity: [0.44, 0.72, 0.44] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-1/2 top-[62%] h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[180px]"
      />
      <motion.div
        aria-hidden="true"
        style={{ y: particleYSlow }}
        animate={{ opacity: [0.18, 0.38, 0.18], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[54%] top-[58%] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-blue-500/5 blur-[240px]"
      />
      <motion.div
        aria-hidden="true"
        style={{ y: particleYSlow }}
        className="absolute left-[42%] top-[72%] h-36 w-36 rounded-full bg-indigo-200/[0.025] blur-3xl"
      />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#050505] via-[#050505]/86 to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] max-w-7xl flex-col items-center justify-center text-center lg:min-h-screen lg:pt-28">
        <motion.div
          style={{ y: textY, opacity: textOpacity }}
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative z-20 mx-auto max-w-5xl"
        >
          <motion.h1
            variants={fadeUp}
            style={{ letterSpacing: textTracking }}
            className="text-[3rem] font-semibold leading-[0.94] tracking-[-0.055em] text-white sm:text-6xl md:text-7xl lg:text-[5.25rem]"
          >
            Tecnologia Apple com <span className="bg-gradient-to-r from-white via-zinc-300 to-zinc-600 bg-clip-text italic text-transparent">experiência premium.</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-zinc-400 md:text-xl lg:mt-8">
            Produtos Apple selecionados para quem valoriza confiança, qualidade e atendimento diferenciado.
          </motion.p>

          <motion.div variants={fadeUp} className="mx-auto mt-8 flex w-full max-w-xl flex-col justify-center gap-4 sm:w-auto sm:flex-row lg:mt-10">
            <a href={WHATSAPP_URL} className="group inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-white px-7 text-base font-semibold text-black transition hover:scale-[1.03] hover:bg-zinc-200 sm:w-auto lg:h-auto lg:px-8 lg:py-4">
              Falar no WhatsApp <MessageCircleIcon className="h-5 w-5" />
            </a>
          </motion.div>

        </motion.div>
      </div>
    </motion.section>
  )
}

function FounderPortrait() {
  const portraitRef = useRef<HTMLDivElement>(null)
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const imageMouseX = useSpring(useTransform(pointerX, [-0.5, 0.5], [-12, 12]), {
    stiffness: 90,
    damping: 24,
    mass: 0.5,
  })
  const imageMouseY = useSpring(useTransform(pointerY, [-0.5, 0.5], [-10, 10]), {
    stiffness: 90,
    damping: 24,
    mass: 0.5,
  })
  const { scrollYProgress } = useScroll({
    target: portraitRef,
    offset: ["start end", "end start"],
  })
  const imageY = useTransform(scrollYProgress, [0, 1], [-26, 26])
  const imageScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.08, 1.04, 1.1])
  const imageCombinedY = useTransform([imageY, imageMouseY], ([scroll, mouse]) => Number(scroll) + Number(mouse))

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5)
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5)
  }

  function handleMouseLeave() {
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <motion.div
      ref={portraitRef}
      initial={{ opacity: 0, y: 54, filter: "blur(18px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-0 -mx-6 h-[690px] w-[calc(100%+3rem)] overflow-visible sm:mx-auto sm:h-[760px] sm:w-full lg:absolute lg:bottom-[-9rem] lg:left-[-18rem] lg:top-[-9rem] lg:mx-0 lg:h-auto lg:w-[82%]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        aria-hidden="true"
        animate={{ opacity: [0.24, 0.44, 0.24], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -inset-[18%] rounded-full bg-white/[0.03] blur-[120px]"
      />
      <div aria-hidden="true" className="absolute -inset-[24%] rounded-full bg-black/40 blur-[180px]" />
      <motion.img
        src="/images/vinicius-ceo-tech.png"
        alt="Vinícius Nobre"
        style={{
          x: imageMouseX,
          y: imageCombinedY,
          scale: imageScale,
          filter: "brightness(0.82) contrast(1.05) saturate(0.85)",
          WebkitMaskImage: "radial-gradient(ellipse at 42% 48%, #000 28%, rgba(0,0,0,0.78) 56%, transparent 92%)",
          maskImage: "radial-gradient(ellipse at 42% 48%, #000 28%, rgba(0,0,0,0.78) 56%, transparent 92%)",
        }}
        className="absolute -inset-[12%] h-[124%] w-[124%] object-cover object-[52%_43%] opacity-90 mix-blend-screen will-change-transform"
      />
      <div className="absolute bottom-[-18%] left-[38%] right-[-38vw] top-[-18%] bg-[radial-gradient(ellipse_at_center,rgba(5,5,5,0.82),rgba(5,5,5,0.42)_42%,transparent_74%)] blur-[80px]" />
      <div className="absolute bottom-[-24%] left-[-20%] right-[-70vw] top-[-24%] bg-[radial-gradient(circle_at_34%_45%,transparent_24%,rgba(5,5,5,0.34)_56%,#050505_92%)]" />
      <div className="absolute bottom-[-24%] left-[-20%] right-[-70vw] top-[-24%] bg-[radial-gradient(ellipse_at_34%_52%,transparent_34%,rgba(0,0,0,0.68)_74%,#050505_100%)]" />
      <div className="absolute bottom-[-24%] left-[-20%] right-[-70vw] top-[-24%] bg-gradient-to-r from-[#050505] via-transparent to-[#050505] opacity-70" />
      <div className="absolute bottom-[-24%] left-[-20%] right-[-70vw] top-[-24%] bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
      <div className="absolute bottom-[-24%] left-[-20%] right-[-70vw] top-[-24%] bg-gradient-to-b from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-[-24%] left-[-20%] right-[-70vw] top-[-24%] shadow-[inset_0_0_180px_rgba(0,0,0,0.95)]" />
    </motion.div>
  )
}

function ProductStage() {
  const stageRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ["start end", "end start"],
  })
  const iphoneScale = useTransform(scrollYProgress, [0.12, 0.72], [0.98, 1.05])
  const iphoneY = useTransform(scrollYProgress, [0.12, 0.72], [40, -25])
  const iphoneRotate = useTransform(scrollYProgress, [0.12, 0.72], [2, -1])
  const glowY = useTransform(scrollYProgress, [0.12, 0.72], [46, -28])
  const glowScale = useTransform(scrollYProgress, [0.12, 0.72], [0.96, 1.14])
  const gridX = useTransform(scrollYProgress, [0, 1], [-8, 8])
  const gridY = useTransform(scrollYProgress, [0, 1], [14, -28])
  const lightY = useTransform(scrollYProgress, [0.12, 0.72], [32, -22])

  return (
    <motion.section
      ref={stageRef}
      className="relative min-h-[150vh] overflow-hidden border-y border-white/10 bg-[#050505] px-6 py-24 md:px-12 md:py-32"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_46%,rgba(180,116,72,0.085),transparent_34%),radial-gradient(ellipse_at_82%_58%,rgba(84,93,170,0.14),transparent_42%),radial-gradient(circle_at_64%_66%,rgba(255,255,255,0.028),transparent_34%),linear-gradient(180deg,#050505_0%,#070707_52%,#050505_100%)]" />
      <motion.div
        aria-hidden="true"
        style={{ x: gridX, y: gridY }}
        className="absolute -inset-12 opacity-[0.028] [background-image:linear-gradient(to_right,rgba(255,255,255,0.72)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.72)_1px,transparent_1px)] [background-size:96px_96px]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_50%,transparent_24%,rgba(5,5,5,0.48)_68%,#050505_100%)]" />

      <div className="sticky top-0 mx-auto flex min-h-screen max-w-7xl items-center py-20 lg:py-0">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
          >
            <motion.p variants={fadeUp} className="mb-5 text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">
              Produtos Apple
            </motion.p>
            <motion.h2 variants={fadeUp} className="max-w-2xl text-5xl font-semibold tracking-[-0.055em] text-white md:text-7xl">
              Performance. Elegância. Experiência.
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-8 max-w-xl text-lg leading-8 text-zinc-400">
              A Nobretech trabalha com produtos Apple selecionados, incluindo lacrados, acessórios e opções premium avaliadas com critério.
            </motion.p>
          </motion.div>

          <div className="relative h-[520px] sm:h-[660px] lg:h-[780px]">
            <motion.div
              aria-hidden="true"
              style={{ y: lightY }}
              animate={{ opacity: [0.12, 0.24, 0.12], scaleY: [0.92, 1.08, 0.92] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              className="absolute left-[54%] top-[10%] h-[78%] w-20 -translate-x-1/2 rotate-[18deg] bg-gradient-to-b from-transparent via-white/[0.055] to-transparent blur-3xl"
            />
            <motion.div
              aria-hidden="true"
              style={{ y: lightY }}
              animate={{ opacity: [0.08, 0.18, 0.08], scaleY: [1.05, 0.94, 1.05] }}
              transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
              className="absolute left-[72%] top-[4%] h-[86%] w-28 -translate-x-1/2 -rotate-[13deg] bg-gradient-to-b from-transparent via-indigo-200/[0.045] to-transparent blur-[54px]"
            />
            <motion.div
              aria-hidden="true"
              style={{ y: glowY, scale: glowScale }}
              animate={{ opacity: [0.72, 1, 0.72] }}
              transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute left-[60%] top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.04] blur-[220px] sm:h-[760px] sm:w-[760px] lg:h-[980px] lg:w-[980px]"
            />
            <motion.div
              aria-hidden="true"
              style={{ y: glowY, scale: glowScale }}
              animate={{ opacity: [0.62, 0.92, 0.62] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute left-[62%] top-[56%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.05] blur-[280px] sm:h-[880px] sm:w-[880px]"
            />
            <div aria-hidden="true" className="absolute left-[58%] top-[56%] h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 blur-[260px]" />
            <div aria-hidden="true" className="absolute left-[72%] top-[62%] h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 blur-[240px]" />

            <motion.div
              style={{ scale: iphoneScale, y: iphoneY, rotate: iphoneRotate }}
              initial={{ opacity: 0, x: 46, filter: "blur(14px)" }}
              whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-1/2 top-[55%] w-[150%] -translate-x-1/2 -translate-y-1/2 sm:w-[136%] lg:left-[61%] lg:w-[150%]"
            >
              <motion.div
                animate={{ y: [0, -16, 0], rotate: [0, -0.55, 0] }}
                transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <Image
                  src="/images/iphone-17-pro-max-orange-featured.webp"
                  alt="iPhone 17 Pro Max"
                  width={1248}
                  height={700}
                  priority
                  sizes="(min-width: 1024px) 62vw, 140vw"
                  className="relative z-10 w-full object-contain opacity-100 mix-blend-lighten"
                  style={{
                    filter: "brightness(0.96) contrast(1.1) saturate(1.18) hue-rotate(-1deg)",
                    WebkitMaskImage: "radial-gradient(ellipse at center, #000 31%, rgba(0,0,0,0.76) 47%, transparent 68%)",
                    maskImage: "radial-gradient(ellipse at center, #000 31%, rgba(0,0,0,0.76) 47%, transparent 68%)",
                  }}
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

export function NobretechLandingPage() {
  return (
    <main data-nobretech-landing className="relative overflow-hidden bg-[#050505] text-white selection:bg-white selection:text-black">
      <NoiseOverlay />

      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/35 px-5 py-4 backdrop-blur-2xl md:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="#inicio" className="shrink-0 text-base font-semibold tracking-[-0.03em] sm:text-lg">
            Nobretech<span className="text-zinc-500"> Store</span>
          </a>

          <nav className="hidden items-center gap-8 text-xs font-medium uppercase tracking-[0.22em] text-zinc-400 md:flex">
            <a href="#vinicius" className="transition hover:text-white">Vinícius</a>
            <a href="#experiencia" className="transition hover:text-white">Experiência</a>
            <a href="#produtos" className="transition hover:text-white">Produtos</a>
          </nav>

          <a href={SYSTEM_URL} className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-xs font-medium text-zinc-300 backdrop-blur-2xl transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white sm:px-4 sm:py-2.5 sm:text-sm">
            Acessar sistema <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </a>
        </div>
      </header>

      <CinematicHero />

      <section id="vinicius" className="relative overflow-hidden border-t border-white/10 px-6 py-28 md:px-12 md:py-40 lg:min-h-[980px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.07),transparent_32%),linear-gradient(180deg,#050505_0%,#090909_45%,#050505_100%)]" />
        <div className="absolute left-[-15%] top-[-10%] h-[1200px] w-[1200px] rounded-full bg-black/40 blur-[180px]" />
        <div className="absolute left-[10%] top-[20%] h-[700px] w-[700px] rounded-full bg-white/[0.03] blur-[120px]" />
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-black/70 via-black/25 to-transparent" />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 lg:min-h-[700px] lg:grid-cols-[minmax(0,0.98fr)_minmax(390px,0.82fr)] lg:gap-24">
          <FounderPortrait />

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.28 }}
            className="relative z-20 mx-auto max-w-2xl lg:col-start-2 lg:mx-0"
          >
            <motion.p variants={fadeUp} className="mb-8 text-xs font-semibold uppercase tracking-[0.42em] text-zinc-500">
              Quem está por trás
            </motion.p>
            <motion.h2 variants={fadeUp} className="text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-white md:text-7xl">
              Uma marca com nome, história e responsabilidade.
            </motion.h2>

            <motion.div variants={fadeUp} className="mt-10 h-px w-28 bg-gradient-to-r from-white/50 to-transparent" />

            <motion.div variants={fadeUp} className="mt-10 space-y-6 text-lg leading-8 text-zinc-400 md:text-xl md:leading-9">
              <p className="text-2xl leading-9 tracking-[-0.035em] text-zinc-100 md:text-3xl md:leading-10">
                Meu nome é <span className="text-white">Vinícius Nobre</span>, fundador da Nobretech Store.
              </p>
              <p>
                Sempre enxerguei a tecnologia como algo além de um produto. Para mim, ela representa experiência, praticidade e conexão.
              </p>
              <p>
                A Nobretech nasceu da ideia de criar uma marca onde as pessoas pudessem comprar tecnologia com mais confiança, transparência e cuidado em cada detalhe.
              </p>
              <p>
                Ao longo de uma década trabalhando com tecnologia e operações industriais em ambientes de alta responsabilidade, desenvolvi uma visão muito clara sobre padrão, processo e excelência.
              </p>
              <p>
                A Nobretech carrega exatamente essa mentalidade.
              </p>
              <p className="space-y-1 text-zinc-300">
                <span className="block">Cada detalhe importa.</span>
                <span className="block">Da curadoria ao atendimento.</span>
                <span className="block">Da procedência à experiência final.</span>
              </p>
              <p>
                Porque tecnologia premium não deveria ser apenas sobre o produto. Mas sobre como você se sente durante toda a experiência.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-12 grid gap-3 sm:grid-cols-3">
              {FOUNDER_BADGES.map((item, index) => (
                <div
                  key={item.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.018] px-5 py-5 backdrop-blur-2xl transition duration-700 hover:-translate-y-[3px] hover:border-white/20 hover:bg-white/[0.04] hover:shadow-[0_22px_80px_rgba(255,255,255,0.045)]"
                >
                  <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/[0.08] opacity-0 blur-3xl transition duration-700 group-hover:scale-125 group-hover:opacity-100" />
                  <div className="mb-5 flex h-5 items-center">
                    {index === 0 && (
                      <span className="block h-px w-7 bg-white/50 shadow-[0_0_18px_rgba(255,255,255,0.34)] transition duration-700 group-hover:w-9 group-hover:bg-white/70" />
                    )}
                    {index === 1 && (
                      <span className="block h-[18px] w-[18px] border border-white/35 bg-white/[0.015] shadow-[inset_0_0_18px_rgba(255,255,255,0.03),0_0_22px_rgba(255,255,255,0.035)] transition duration-700 group-hover:rotate-45 group-hover:border-white/55 group-hover:bg-white/[0.035]" />
                    )}
                    {index === 2 && (
                      <span className="relative flex h-5 w-5 items-center justify-center">
                        <motion.span
                          aria-hidden="true"
                          animate={{ opacity: [0.12, 0.32, 0.12], scale: [0.9, 1.45, 0.9] }}
                          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute h-5 w-5 rounded-full bg-white/20 blur-md"
                        />
                        <span className="relative h-1.5 w-1.5 rounded-full bg-white/65 shadow-[0_0_18px_rgba(255,255,255,0.45)] transition duration-700 group-hover:bg-white/85" />
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-white">{item.title}</p>
                  <p className="mt-1.5 text-xs leading-5 text-zinc-500">{item.text}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="experiencia" className="relative px-6 py-28 md:px-12 md:py-40">
        <div className="mx-auto max-w-7xl">
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.35 }} className="mb-16 max-w-3xl">
            <motion.p variants={fadeUp} className="mb-5 text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Experiência Nobretech</motion.p>
            <motion.h2 variants={fadeUp} className="text-5xl font-semibold tracking-[-0.055em] md:text-7xl">Não é só sobre comprar um produto. É sobre comprar com confiança.</motion.h2>
          </motion.div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {EXPERIENCE_CARDS.map((card, index) => {
              const Icon = card.icon
              return (
                <motion.div key={card.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.65, delay: index * 0.06 }} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl transition duration-500 hover:-translate-y-2 hover:border-white/25 hover:bg-white/[0.06]">
                  <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-white/10 blur-3xl opacity-0 transition duration-500 group-hover:opacity-100" />
                  <Icon className="mb-8 h-8 w-8 text-zinc-300" />
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">{card.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-zinc-500">{card.text}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      <ProductStage />

      <section id="produtos" className="relative px-6 py-28 md:px-12 md:py-40">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Catálogo</p>
              <h2 className="max-w-3xl text-5xl font-semibold tracking-[-0.055em] md:text-7xl">Apple, do jeito certo.</h2>
            </div>
            <p className="max-w-md text-lg leading-8 text-zinc-400">
              iPhones, iPads, MacBooks e acessórios selecionados para quem busca qualidade, procedência e experiência premium.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {PRODUCT_CARDS.map((item) => {
              const Icon = item.icon
              return (
                <a key={item.title} href={WHATSAPP_URL} className="group min-h-[360px] rounded-[2.25rem] border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.025] to-transparent p-8 transition duration-500 hover:-translate-y-2 hover:border-white/25">
                  <div className="mb-20 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-black/40">
                    <Icon className="h-8 w-8 text-zinc-300" />
                  </div>
                  <h3 className="text-3xl font-semibold tracking-[-0.04em]">{item.title}</h3>
                  <p className="mt-5 leading-7 text-zinc-500">{item.text}</p>
                  <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-zinc-300">
                    Consultar disponibilidade <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" />
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </section>

      <section className="relative min-h-screen overflow-hidden px-6 py-28 md:px-12 md:py-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.10),transparent_34%),linear-gradient(to_bottom,#050505,#090909,#050505)]" />
        <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center text-center">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Nobretech Store</p>
          <h2 className="text-5xl font-semibold leading-[0.95] tracking-[-0.06em] md:text-8xl md:tracking-[-0.075em]">
            Tecnologia premium. Atendimento humano. Experiência diferenciada.
          </h2>
          <p className="mt-9 max-w-2xl text-lg leading-8 text-zinc-400">
            Se você valoriza confiança, transparência e uma experiência acima da compra comum, a Nobretech foi criada para você.
          </p>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href={WHATSAPP_URL} className="inline-flex items-center gap-3 rounded-full bg-white px-9 py-5 text-lg font-semibold text-black transition hover:scale-[1.03] hover:bg-zinc-200">
              Falar no WhatsApp <ArrowRightIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-sm text-zinc-500 md:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-zinc-300">Nobretech Store</p>
          <p>Quem entende, compra certo.</p>
          <p>@nobretechstore</p>
        </div>
      </footer>
    </main>
  )
}
