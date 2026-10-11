import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS } from './settings';
import type { DrawSettings, QuotaView, RoundRecord } from './types';

export const settingsItem = storage.defineItem<DrawSettings>('local:drawSettings', {
  fallback: DEFAULT_SETTINGS,
});
export const quotaItem = storage.defineItem<QuotaView | null>('local:quota', { fallback: null });
export const historyItem = storage.defineItem<RoundRecord[]>('local:drawHistory', { fallback: [] });

export const HISTORY_LIMIT = 200;
