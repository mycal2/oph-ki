"use client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

function getEnvironment(): { label: string; color: string } | null {
  if (siteUrl.includes("dev.") || siteUrl.includes("-dev.")) {
    return { label: "DEVELOPMENT", color: "bg-yellow-500 text-black" };
  }
  if (siteUrl.includes("staging.") || siteUrl.includes("-staging.")) {
    return { label: "STAGING", color: "bg-orange-500 text-white" };
  }
  return null;
}

export function EnvironmentBanner() {
  const env = getEnvironment();
  if (!env) return null;

  return (
    <div
      className={`${env.color} text-center text-sm font-extrabold tracking-widest uppercase py-2.5 px-2 relative z-0`}
    >
      ⚠ {env.label} UMGEBUNG — Keine Produktionsdaten ⚠
    </div>
  );
}
