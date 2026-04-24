import type { NextConfig } from "next";

const supabaseStorageHost = (() => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      ...(supabaseStorageHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseStorageHost,
              pathname: "/storage/v1/object/public/Avatars/**",
            },
            {
              protocol: "https" as const,
              hostname: supabaseStorageHost,
              pathname: "/storage/v1/object/sign/Avatars/**",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
