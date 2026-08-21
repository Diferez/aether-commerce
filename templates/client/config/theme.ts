import { themeConfigSchema } from "@aether-commerce/config-schema";

export const themeConfig = themeConfigSchema.parse({
  primary: "#000000",
  secondary: "#4b5563",
  background: "#ffffff",
  surface: "#f4f4f5",
  text: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  radius: "0.5rem",
  font: "system-ui, sans-serif"
});
