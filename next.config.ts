import type { NextConfig } from "next"

function r2RemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) return []

  try {
    const url = new URL(publicUrl)
    if (url.protocol !== "https:") return []
    return [{
      protocol: "https",
      hostname: url.hostname,
      pathname: "/**",
    }]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2RemotePatterns(),
  },
}

export default nextConfig
