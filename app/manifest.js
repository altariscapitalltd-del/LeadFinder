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
      { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" },
      { src: "/apple-icon.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
  };
}
