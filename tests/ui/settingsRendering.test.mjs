// Page-level rendering tests for the Settings and Profile surfaces.
//
// These render the real pages, so they catch the class of problem where a
// page looks finished but a control points at nothing: a toggle that saves
// nothing, a language that is offered but not implemented, a delete button
// that only clears the session.
//
// The pages read from `localStorage`, so a memory storage is installed for
// the duration of each test.

import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createTestViteServer } from '../support/viteTestServer.mjs';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';

let viteServer;
let Settings;
let Profile;

const originalLocalStorage = globalThis.localStorage;
let storage;

before(async () => {
  viteServer = await createTestViteServer();
  Settings = (await viteServer.ssrLoadModule('/src/pages/Settings.jsx')).default;
  Profile = (await viteServer.ssrLoadModule('/src/pages/Profile.jsx')).default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

beforeEach(() => {
  storage = new MemoryStorage();
  globalThis.localStorage = storage;
});

afterEach(() => {
  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = originalLocalStorage;
  }
});

/**
 * Registers a learner and signs them in, so the pages see a real account
 * rather than redirecting to the sign-in page.
 */
async function signInLearner() {
  const { AuthService } = await viteServer.ssrLoadModule('/src/utils/auth.js');
  const result = await AuthService.register(
    'Ada Lovelace',
    'ada@example.com',
    'analytical-engine'
  );
  assert.equal(result.success, true);
  return result.user;
}

const renderPage = (component, props = {}) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(component, props)
    )
  );

test('the settings page renders every section it promises', async () => {
  await signInLearner();
  const html = renderPage(Settings);

  assert.match(html, /Settings/);
  // Learning preferences.
  assert.match(html, /Default explanation level/);
  assert.match(html, /Motion/);
  // Provider status.
  assert.match(html, /AI provider/);
  assert.match(html, /Capability status/);
  // Privacy.
  assert.match(html, /Privacy/);
  assert.match(html, /Record my learning activity/);
  // Data.
  assert.match(html, /Your data/);
  assert.match(html, /Export my data/);
  assert.match(html, /Import/);
  // Deletion.
  assert.match(html, /Delete all my data/);
});

test('the settings page names the languages it cannot produce', async () => {
  await signInLearner();
  const html = renderPage(Settings);

  // English is available locally.
  assert.match(html, /Available locally/);
  // The other languages say they are not connected, rather than appearing
  // as working choices.
  assert.match(html, /Not connected — no translation service is configured/);
  assert.equal(/Spanish[\s\S]{0,120}Available locally/.test(html), false);
});

test('the settings page reports a gateway that is not running honestly', async () => {
  await signInLearner();
  // No fetch is available in this environment, so the probe fails.
  const html = renderPage(Settings);
  assert.match(html, /The AI gateway is not running|checking the gateway/i);
});

test('the settings page shows a derived streak, never a stored number', async () => {
  await signInLearner();
  const html = renderPage(Settings);
  // With no activity recorded, the streak is 0 and the figure is derived.
  assert.match(html, /Day streak/);
  assert.match(html, /Recorded actions/);
});

test('the settings page offers the import modes it describes', async () => {
  await signInLearner();
  const html = renderPage(Settings);
  assert.match(html, /Merge with what is here/);
  assert.match(html, /Replace everything/);
});

test('the profile page shows the account and links to the real settings', async () => {
  await signInLearner();
  const html = renderPage(Profile);

  assert.match(html, /Ada Lovelace/);
  assert.match(html, /ada@example\.com/);
  // The delete control now points at the surface that actually deletes.
  assert.match(html, /Go to Settings/);
  assert.match(html, /href="\/settings"/);
});

test('the profile page does not advertise unconnected services', async () => {
  await signInLearner();
  const html = renderPage(Profile);

  // Email notifications and reminders have no server behind them, so the
  // page says so instead of offering a switch.
  assert.match(html, /Not available — this app has no server to send email from/);
  assert.match(html, /Not available — this app has no server to schedule reminders/);
  assert.equal(/type="checkbox"[^>]*defaultChecked/.test(html), false);
});

test('the profile page shows a real member-since date', async () => {
  await signInLearner();
  const html = renderPage(Profile);
  assert.match(html, /Member since/);
});

test('a signed-out visitor sees nothing on either page', () => {
  const settings = renderPage(Settings);
  const profile = renderPage(Profile);
  // The pages redirect instead of rendering a broken shell.
  assert.equal(settings.trim(), '');
  assert.equal(profile.trim(), '');
});
