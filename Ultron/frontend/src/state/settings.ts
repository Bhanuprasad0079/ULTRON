const CAPTIONS_KEY = "ultron.settings.captions_enabled";

export function loadCaptionsEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(CAPTIONS_KEY);

    if (raw === null) {
      return true;
    }

    return raw !== "false";
  } catch {
    return true;
  }
}

export function saveCaptionsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(CAPTIONS_KEY, String(enabled));
  } catch {
    // localStorage may fail in some environments.
    // For Phase 2, that is acceptable.
  }
}