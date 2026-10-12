/**
 * dsh-mocha smoke test.
 *
 * Syntax checking proves nothing about whether the two halves actually register.
 * This drives both of them against minimal fakes:
 *   - the host half against a fake ctx (systemPrompt + webServer), including the
 *     persona route in GET / POST / malformed-body cases;
 *   - the client half through its ModuleLoader factory, asserting the two slot
 *     registrations and rendering both components once.
 *
 * Run: node test/smoke.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Windows absolute paths must be file:// URLs before dynamic import.
function loadAbs(...segments) {
  return import(pathToFileURL(path.join(ROOT, ...segments)).href)
}

/* ----------------------------------------------------------------- host half */

const host = await loadAbs('lib/index.js')

assert.equal(host.name, 'dsh-mocha', 'host exports a stable name')
assert.deepEqual(host.inject, ['webServer'], 'host declares the webServer dependency')
assert.equal(typeof host.apply, 'function', 'host exports apply')

const routes = []
let sectionArg = null

const hostCtx = {
  get(name) {
    if (name === 'systemPrompt') {
      return { section(arg) { sectionArg = arg; return () => {} } }
    }
    return undefined
  },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
  webServer: { register(route) { routes.push(route); return () => {} } },
}

host.apply(hostCtx)

assert.ok(sectionArg, 'persona section was registered')
assert.equal(sectionArg.name, 'mocha-voice-interface')
assert.equal(sectionArg.order, 0)
assert.equal(typeof sectionArg.text, 'function', 'section text is a function so the toggle is live')
assert.ok(sectionArg.text().includes('Mocha'), 'persona names the assistant')
assert.ok(sectionArg.text().includes('MOSS'), 'persona keeps the anti-impersonation clause')

assert.equal(routes.length, 1, 'exactly one route registered')
assert.equal(routes[0].path, '/dsh-mocha/persona')

function callRoute(method, body) {
  return new Promise((resolve) => {
    const req = new EventEmitter()
    req.method = method
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) { this.headers[k] = v },
      end(chunk) { resolve(JSON.parse(String(chunk || '{}'))) },
    }
    routes[0].handler(req, res)
    if (method === 'POST') {
      req.emit('data', body === undefined ? '' : body)
      req.emit('end')
    }
  })
}

let state = await callRoute('GET')
assert.equal(state.personaOn, true, 'persona starts on')

state = await callRoute('POST', JSON.stringify({ on: false }))
assert.equal(state.personaOn, false, 'POST turns persona off')
assert.equal(sectionArg.text(), '', 'a disabled persona contributes no prompt text')

state = await callRoute('POST', 'this is not json')
assert.equal(state.personaOn, false, 'malformed body keeps the current state instead of throwing')

state = await callRoute('POST', JSON.stringify({ on: true }))
assert.equal(state.personaOn, true, 'POST turns persona back on')
assert.ok(sectionArg.text().includes('Mocha'), 're-enabled persona contributes text again')

state = await callRoute('POST', JSON.stringify({ on: 'yes' }))
assert.equal(state.personaOn, true, 'a non-boolean on value is ignored')

/* --------------------------------------------------------------- client half */

const fakeReact = {
  createElement(type, props, ...children) { return { type, props, children } },
  useState(initial) { return [initial, function () {}] },
  useEffect() {},
}

const captured = {}
globalThis.window = {
  __ModuleLoader__: { load(spec) { captured.spec = spec } },
}
globalThis.document = {
  head: { appendChild() {} },
  createElement() {
    return { parentNode: null, setAttribute() {}, removeChild() {} }
  },
}
globalThis.fetch = async () => ({ json: async () => ({ personaOn: true }) })

await loadAbs('lib/client.js')

assert.ok(captured.spec, 'client half called ModuleLoader.load')
assert.equal(captured.spec.id, 'dsh-mocha')
assert.equal(typeof captured.spec.factory, 'function')
assert.equal(typeof captured.spec.factory, 'function', 'factory is loadable')

const clientModule = captured.spec.factory((name) => {
  if (name === 'react') return fakeReact
  throw new Error('unexpected require: ' + name)
})

assert.equal(typeof clientModule.apply, 'function', 'client exports apply')
assert.deepEqual(clientModule.inject, ['slots'], 'client declares the slots dependency')

const registrations = []
const slots = {
  inject(key, cb) { cb(); return () => {} },
  register(opts, render) { registrations.push({ opts, render }); return () => {} },
}

clientModule.apply({
  get(name) { return name === 'slots' ? slots : undefined },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
})

assert.equal(registrations.length, 2, 'both slot entries registered')

const byId = {}
for (const r of registrations) byId[r.opts.id] = r

assert.ok(byId['mocha-hud'], 'mocha-hud registered')
assert.equal(byId['mocha-hud'].opts.name, 'shell.overlay')
assert.ok(byId['mocha-bridge'], 'mocha-bridge registered')
assert.equal(byId['mocha-bridge'].opts.name, 'conversation.input.left')

const slotProps = {
  useSession: (sel) => sel({ running: false }),
  useChat: (sel) => sel({ nodes: new Map() }),
  inputActions: { setDraft() {}, submit() {} },
}

// The slot render returns an element whose type is the component; drive it down
// to a host element so the component function bodies actually execute.
function renderDeep(node, depth) {
  const d = depth || 0
  if (!node || d > 6) return node
  if (typeof node.type === 'function') return renderDeep(node.type(node.props || {}), d + 1)
  return node
}

for (const id of ['mocha-hud', 'mocha-bridge']) {
  const node = byId[id].render(slotProps)
  assert.ok(node, id + ' renders an element without throwing')
  const tree = renderDeep(node)
  assert.equal(typeof tree.type, 'string', id + ' renders down to a host element')
}

console.log('dsh-mocha smoke test: all assertions passed')
console.log('  host  : persona section + /dsh-mocha/persona route OK')
console.log('  client: ModuleLoader factory + mocha-hud / mocha-bridge registrations OK')
