/**
 * OpenAI model list and recommended defaults.
 * Used by Config UI dropdown and as fallback when sending requests to OpenAI.
 */
export const OPENAI_MODELS = {
  recommended_models: {
    chat: "gpt-5-chat-latest",
    reasoning: "gpt-5",
    lightweight: "gpt-5-mini",
    image: "gpt-image-1",
    audio: "gpt-audio-mini",
  },
  chat_models: [
    "gpt-5-chat-latest",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4o-mini",
  ],
  reasoning_models: [
    "gpt-5",
    "gpt-5-pro",
    "gpt-5.2-pro",
    "o3",
    "o4-mini",
    "o4-mini-deep-research",
  ],
  image_models: [
    "gpt-image-1",
    "gpt-image-1-mini",
    "gpt-image-1.5",
  ],
  audio_models: [
    "gpt-audio",
    "gpt-audio-mini",
    "gpt-4o-audio-preview",
  ],
  transcribe_models: [
    "gpt-4o-transcribe",
    "gpt-4o-mini-transcribe",
  ],
  search_models: [
    "gpt-5-search-api",
    "gpt-4o-search-preview",
    "gpt-4o-mini-search-preview",
  ],
} as const;

/** Default model for chat / test case generation (used when openai_model not set). */
export const OPENAI_DEFAULT_MODEL = OPENAI_MODELS.recommended_models.chat;

/** Optgroups for native <select>: label + model ids. */
export const OPENAI_MODEL_GROUPS: { label: string; models: readonly string[] }[] = [
  { label: "Chat", models: OPENAI_MODELS.chat_models },
  { label: "Reasoning", models: OPENAI_MODELS.reasoning_models },
  { label: "Image", models: OPENAI_MODELS.image_models },
  { label: "Audio", models: OPENAI_MODELS.audio_models },
  { label: "Transcribe", models: OPENAI_MODELS.transcribe_models },
  { label: "Search", models: OPENAI_MODELS.search_models },
];

/** All model ids (for “custom value” check in dropdown). */
export const OPENAI_ALL_MODEL_IDS = [
  ...OPENAI_MODELS.chat_models,
  ...OPENAI_MODELS.reasoning_models,
  ...OPENAI_MODELS.image_models,
  ...OPENAI_MODELS.audio_models,
  ...OPENAI_MODELS.transcribe_models,
  ...OPENAI_MODELS.search_models,
];
