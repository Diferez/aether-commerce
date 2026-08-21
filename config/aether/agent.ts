import { agentConfigSchema } from "@aether-commerce/config-schema";

export const aetherAgentConfig = agentConfigSchema.parse({
  enabled: true,
  publicUrlEnv: "NEXT_PUBLIC_AETHER_AI_URL",
  defaultLocale: "es-CO",
  maxInputCharacters: 4000
});
