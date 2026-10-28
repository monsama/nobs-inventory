/* The front end. The modules import each other as they need; the core module has no imports, so it runs first.
   Then the app starts. */
import './01-core.js';
import './02-views.js';
import './03-object-modals.js';
import './04-settings.js';
import './05-new-object.js';
import './06-topbar.js';
import './14-global-search.js';
import './tips.js';
import { boot } from './07-render-plans.js';

boot();
