/* For the browser tests: the names the tests use are read from the page's global scope, as they were before the page
   was split into modules. Each global is a live link to the module's name, so a changed value is seen. A name the
   browser already has (such as name or history) is not replaced. Nothing in the app itself uses these globals. */
import * as core from './01-core.js';
import * as views from './02-views.js';
import * as objectModals from './03-object-modals.js';
import * as settings from './04-settings.js';
import * as newObject from './05-new-object.js';
import * as topbar from './06-topbar.js';
import * as renderPlans from './07-render-plans.js';

for (const ns of [core, views, objectModals, settings, newObject, topbar, renderPlans]) {
  for (const name of Object.keys(ns)) {
    if (!(name in window)) Object.defineProperty(window, name, { get: () => ns[name], configurable: true });
  }
}
