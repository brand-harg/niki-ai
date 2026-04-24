export type PersonalizationSettings = {
  about_user: string;
  response_style: string;
  default_niki_mode: boolean;
};

export const PERSONALIZATION_STORAGE_KEY = "niki_personalization_settings";

export const DEFAULT_PERSONALIZATION_SETTINGS: PersonalizationSettings = {
  about_user: "",
  response_style: "",
  default_niki_mode: false,
};

function normalizeSettings(value: unknown): PersonalizationSettings {
  const source =
    value && typeof value === "object" ? (value as Partial<PersonalizationSettings>) : {};

  return {
    about_user: typeof source.about_user === "string" ? source.about_user : "",
    response_style: typeof source.response_style === "string" ? source.response_style : "",
    default_niki_mode: source.default_niki_mode === true,
  };
}

export function parsePersonalizationSettings(rawValue: string | null | undefined) {
  if (!rawValue) return DEFAULT_PERSONALIZATION_SETTINGS;

  try {
    return normalizeSettings(JSON.parse(rawValue));
  } catch {
    return DEFAULT_PERSONALIZATION_SETTINGS;
  }
}

export function readLocalPersonalizationSettings() {
  if (typeof window === "undefined") return DEFAULT_PERSONALIZATION_SETTINGS;
  return parsePersonalizationSettings(window.localStorage.getItem(PERSONALIZATION_STORAGE_KEY));
}

export function writeLocalPersonalizationSettings(settings: PersonalizationSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(settings));
}
