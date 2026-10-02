import { z } from "zod";

// Only transport fields are consumed here. Saved prompt libraries and other
// UI preferences are deliberately stripped before constructing provider work.
const providerSettingsSchema = z.object({
  baseUrl: z.string().max(2048).optional(),
  model: z.string().max(256).optional(),
  apiKey: z.string().max(8192).optional(),
  temperature: z.number().finite().min(0).max(2).optional()
});

export const translateRequestSchema = z.object({
  prompt: z.string().max(262144).optional(),
  reasoning: z.boolean().optional(),
  settings: providerSettingsSchema.optional()
});

export const connectionRequestSchema = z.object({
  settings: providerSettingsSchema.optional()
});
