export default function manifest() {
  return {
    name: "LeadForge AI",
    short_name: "LeadForge",
    description: "AI-powered lead discovery, outreach orchestration, and operator agent.",
    start_url: "/",
    display: "standalone",
    background_color: "#060914",
    theme_color: "#0a0f1e",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
