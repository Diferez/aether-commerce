import { agentConfigSchema } from "@aether-commerce/config-schema";

export const agentConfig = agentConfigSchema.parse({ enabled: true, publicUrlEnv: "NEXT_PUBLIC_AETHER_AI_URL", defaultLocale: "en-US" });
