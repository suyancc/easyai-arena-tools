import { FAMILIES, type Family } from '../../utils/fingerprint/types';
import type { DrawSettings } from '../../utils/types';
const field = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;
export function fillFingerprintSettings(form: HTMLFormElement, settings: DrawSettings) {
  for (const family of FAMILIES) field(form, `fingerprint-${family}`).checked = settings.fingerprintFamilies.includes(family);
  field(form, 'fingerprintEveryTurn').checked = settings.fingerprintEveryTurn;
}
export function readFingerprintSettings(form: HTMLFormElement): { fingerprintFamilies: Family[]; fingerprintEveryTurn: boolean } {
  return {
    fingerprintFamilies: FAMILIES.filter(family => field(form, `fingerprint-${family}`).checked),
    fingerprintEveryTurn: field(form, 'fingerprintEveryTurn').checked,
  };
}
