/* The front end. The modules import each other as they need; the core module has no imports, so it runs first. The
   bridge gives the browser tests their global names. Then the app starts. */
import './01-core.js';
import './02-views.js';
import './03-object-modals.js';
import './04-settings.js';
import './05-new-object.js';
import './06-topbar.js';
import { boot } from './07-render-plans.js';
import './bridge.js';

boot();
