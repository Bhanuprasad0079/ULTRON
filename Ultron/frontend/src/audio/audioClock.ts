let current: HTMLAudioElement | null = null;

export function setAudioElement(el: HTMLAudioElement | null): void {
  current = el;
}

export function getAudioElement(): HTMLAudioElement | null {
  return current;
}