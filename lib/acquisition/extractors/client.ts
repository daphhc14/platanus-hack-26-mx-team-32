import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_EXTRACTOR_MODEL = "claude-haiku-4-5";
export const ESCALATION_EXTRACTOR_MODEL = "claude-opus-4-8";

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function extractorModel(): string {
  return process.env.EXTRACTOR_MODEL || DEFAULT_EXTRACTOR_MODEL;
}

export function createAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

