/**
 * Inside the native shell, every full page load is served the root
 * index.html, whatever the URL: Capacitor's local server maps any
 * extensionless path to it. That happens when iOS reloads the web view after
 * reclaiming its memory. Hydrating the root page's HTML under another URL is
 * a mismatch, so the native build's root layout runs this first, before
 * React starts, to go to the root. Nothing is lost: the vault key lived in
 * that memory, so the next screen is unlock either way.
 *
 * A string, because it runs as an inline <script> ahead of the bundle.
 */
export const NATIVE_RELOAD_TO_ROOT = 'if(location.pathname!=="/")location.replace("/")';
