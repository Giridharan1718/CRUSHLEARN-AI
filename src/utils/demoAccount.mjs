// The demo account.
//
// The sign-in page offers a demo account. It is a real account with a real
// password verifier, seeded on first use so the button keeps working without
// anyone typing a password that was never set.
//
// The demo profile starts with no completed lessons and no streak. The
// numbers a learner sees come from their own activity, so a demo account
// shows an empty dashboard until the learner does something.

import { createAccountStore, normalizeEmail } from './accountStore.mjs';

export const DEMO_EMAIL = 'demo@crushlearn.ai';
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_NAME = 'Demo Learner';

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Creates the demo account if it does not exist yet. Safe to call on every
 * app start.
 */
export async function ensureDemoAccount(storage = safeStorage()) {
  if (!storage) return { ok: false, created: false };

  try {
    const store = createAccountStore(storage);
    if (store.findByEmail(DEMO_EMAIL)) {
      return { ok: true, created: false };
    }

    const result = await store.register({
      name: DEMO_NAME,
      email: normalizeEmail(DEMO_EMAIL),
      password: DEMO_PASSWORD,
    });

    return { ok: result.ok, created: result.ok };
  } catch {
    return { ok: false, created: false };
  }
}

/** True when the demo account already exists. */
export function demoAccountExists(storage = safeStorage()) {
  if (!storage) return false;
  try {
    return Boolean(createAccountStore(storage).findByEmail(DEMO_EMAIL));
  } catch {
    return false;
  }
}
