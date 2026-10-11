import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { rpc } from '../utils/page-rpc';
import { FORM_ACTIONS, type FormAction, type FormState } from '../utils/registration/contracts';
export default defineContentScript({
  matches: ['https://arena.ai/*'], runAt: 'document_idle',
  main() {
    const canceled = new Set<string>();
    browser.runtime.onMessage.addListener((req: any, sender, reply) => {
      if (!req || !['registration:page', 'registration:cancel'].includes(req.type)) return;
      if (sender.id !== browser.runtime.id || sender.tab || typeof req.job !== 'string' || req.job.length > 80) return;
      if (req.type === 'registration:cancel') {
        if (canceled.size > 16) canceled.delete(canceled.values().next().value!);
        canceled.add(req.job); reply({ ok: true }); return;
      }
      if (canceled.has(req.job) || !FORM_ACTIONS.includes(req.action as FormAction) || location.origin !== 'https://arena.ai') { reply({ ok: false }); return; }
      // The mailbox client_id/refresh_token NEVER enter this bridge or the page world.
      const data: Record<string, string> = {};
      for (const key of ['email', 'name', 'password']) if (typeof req.data?.[key] === 'string' && req.data[key].length <= 254) data[key] = req.data[key];
      void rpc<FormState>('registrationForm', [req.action, data], 8000).then(value => {
        reply(canceled.has(req.job) ? { ok: false } : { ok: true, data: value });
      }, () => reply({ ok: false }));
      return true;
    });
  },
});
