/**
 * Host half of the subagent hub: mount the panel API and keep it free of
 * business logic (see `./api.js`).
 *
 * @module dsh-subagent-hub
 */
import { handle } from './api.js'

/** Cordis plugin name. */
export const name = 'subagent-hub'

/**
 * Wait for the browser HTTP carrier before mounting: `apply` may run before the
 * web server row is up, and `ctx.get('webServer')` would then be undefined and
 * the panel routes would silently never exist.
 */
export const inject = ['webServer']

/** Same-origin prefix the composer panel talks to. */
const BASE = '/subagent-hub'

/**
 * Mount the panel routes on the web server.
 * @param {object} ctx plugin context
 */
export function apply(ctx) {
  const web = ctx.get('webServer')
  if (web === undefined) return
  ctx.effect(() => web.register({
    kind: 'prefix',
    path: BASE,
    handler: (req, res) => handle(ctx, BASE, req, res),
  }))
}
