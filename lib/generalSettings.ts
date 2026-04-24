export type ThemeAccent = "cyan" | "green" | "amber";

export type GeneralSettings = {
  theme_accent: ThemeAccent;
  compact_mode: boolean;
  cmd_enter_to_send: boolean;
};

export const THEME_ACCENT_STORAGE_KEY = "theme_accent";
export const COMPACT_MODE_STORAGE_KEY = "niki_compact_mode";
export const CMD_ENTER_TO_SEND_STORAGE_KEY = "niki_cmd_enter_to_send";

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  theme_accent: "cyan",
  compact_mode: false,
  cmd_enter_to_send: false,
};

function normalizeThemeAccent(value: unknown): ThemeAccent {
  return value === "green" || value === "amber" || value === "cyan" ? value : "cyan";
}

function parseBoolean(value: string | null): boolean | null {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

export function readLocalGeneralSettings(): GeneralSettings {
  if (typeof window === "undefined") return DEFAULT_GENERAL_SETTINGS;

  const compactMode = parseBoolean(window.localStorage.getItem(COMPACT_MODE_STORAGE_KEY));
  const cmdEnterToSend = parseBoolean(
    window.localStorage.getItem(CMD_ENTER_TO_SEND_STORAGE_KEY)
  );

  return {
    theme_accent: normalizeThemeAccent(
      window.localStorage.getItem(THEME_ACCENT_STORAGE_KEY)
    ),
    compact_mode:
      compactMode === null ? DEFAULT_GENERAL_SETTINGS.compact_mode : compactMode,
    cmd_enter_to_send:
      cmdEnterToSend === null
        ? DEFAULT_GENERAL_SETTINGS.cmd_enter_to_send
        : cmdEnterToSend,
  };
}

export function writeLocalGeneralSettings(settings: Partial<GeneralSettings>) {
  if (typeof window === "undefined") return;

  if (settings.theme_accent) {
    window.localStorage.setItem(
      THEME_ACCENT_STORAGE_KEY,
      normalizeThemeAccent(settings.theme_accent)
    );
  }

  if (typeof settings.compact_mode === "boolean") {
    window.localStorage.setItem(COMPACT_MODE_STORAGE_KEY, String(settings.compact_mode));
  }

  if (typeof settings.cmd_enter_to_send === "boolean") {
    window.localStorage.setItem(
      CMD_ENTER_TO_SEND_STORAGE_KEY,
      String(settings.cmd_enter_to_send)
    );
  }
}
