/**
 * dsh-mocha client half: loaded by the web ModuleLoader as a plain React plugin.
 *
 * Registers two entries:
 *   - `shell.overlay`            → a floating Mocha HUD (status, toggles)
 *   - `conversation.input.left`  → a compact bridge beside the composer
 *
 * Voice input and readout run entirely in the browser. The only thing that
 * crosses to the host is the persona toggle, over /dsh-mocha/persona.
 *
 * This file is the persistent (bundle) version of the same feature that once
 * lived as a dynamic Cordis plugin. Differences from that version: it is wrapped
 * in a ModuleLoader factory, React comes from `require`, the host bridge is HTTP
 * instead of `host.call`, and CSS is inserted into the document directly.
 */
window.__ModuleLoader__.load({
  id: 'dsh-mocha',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const el = React.createElement

    const PERSONA_URL = '/dsh-mocha/persona'
    const WAKE_DEFAULT = 'Mocha, 莫卡, 摩卡, moka'

    const ui = {
      micOn: false,
      autoSpeak: true,
      autoSubmit: true,
      stripSources: true,
      personaOn: true,
      wakeAlt: WAKE_DEFAULT,
      status: 'idle',
      note: '待命',
    }

    const watchers = new Set()
    function notify() {
      for (const fn of Array.from(watchers)) {
        try { fn() } catch (err) {}
      }
    }
    function patch(next) {
      Object.assign(ui, next)
      notify()
    }
    function useUi() {
      const bumpPair = React.useState(0)
      const bump = bumpPair[1]
      React.useEffect(function () {
        const fn = function () { bump(function (n) { return n + 1 }) }
        watchers.add(fn)
        return function () { watchers.delete(fn) }
      }, [])
      return ui
    }

    const CSS = [
      '.dsh-mocha-hud{position:fixed;right:16px;bottom:104px;z-index:70;pointer-events:auto;width:238px;',
      'font:12px/1.5 system-ui,-apple-system,"Segoe UI","Microsoft JhengHei",sans-serif;',
      'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-overlay);',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:12px;',
      'box-shadow:0 8px 28px rgba(0,0,0,.18);overflow:hidden}',
      '.dsh-mocha-hud.is-collapsed{width:auto}',
      '.dsh-mocha-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-mocha-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-secondary);flex:0 0 auto}',
      '.dsh-mocha-dot.is-live{background:var(--dsw-alias-state-success-primary)}',
      '.dsh-mocha-dot.is-busy{background:var(--dsw-alias-brand-primary)}',
      '.dsh-mocha-dot.is-err{background:var(--dsw-alias-state-error-primary)}',
      '.dsh-mocha-title{font-weight:600;flex:1 1 auto}',
      '.dsh-mocha-body{padding:8px 10px 10px;display:flex;flex-direction:column;gap:7px}',
      '.dsh-mocha-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dsh-mocha-note{color:var(--dsw-alias-label-secondary);font-size:11px;min-height:16px}',
      '.dsh-mocha-btn{pointer-events:auto;cursor:pointer;border:1px solid var(--dsw-alias-border-l1);',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);',
      'border-radius:7px;padding:3px 8px;font:inherit}',
      '.dsh-mocha-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-mocha-btn.is-on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.dsh-mocha-btn.is-mini{padding:2px 6px;font-size:11px}',
      '.dsh-mocha-wake{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:7px;padding:3px 6px;font:inherit}',
      '.dsh-mocha-bridge{pointer-events:auto;display:inline-flex;align-items:center;gap:5px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);border-radius:999px;padding:2px 9px;font:inherit;font-size:12px}',
      '.dsh-mocha-bridge.is-live{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
    ].join('')

    function wakeList() {
      return String(ui.wakeAlt || '')
        .split(/[,，\s]+/)
        .map(function (w) { return w.trim().toLowerCase() })
        .filter(Boolean)
    }

    function matchWake(text) {
      const low = String(text || '').toLowerCase()
      let hit = null
      for (const w of wakeList()) {
        const i = low.lastIndexOf(w)
        if (i < 0) continue
        if (!hit || w.length > hit.word.length || (w.length === hit.word.length && i > hit.index)) {
          hit = { word: w, index: i }
        }
      }
      return hit
    }

    function stripForSpeech(text) {
      let t = String(text || '')
      t = t.replace(/```[\s\S]*?```/g, ' ')
      t = t.replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:資料來源|參考資料|參考文獻|引用來源|來源|Sources?|References?|Citations?)\s*[:：]?\s*(?:\n[\s\S]*)?$/i, '')
      t = t.replace(/\[([^\]]{1,140})\]\((?:https?:\/\/|\/|#)[^)]*\)/g, '$1')
      t = t.replace(/https?:\/\/[^\s)）\]}]+/g, '')
      t = t.replace(/\[\d{1,3}\]/g, '')
      t = t.replace(/[ \t\u00a0]+/g, ' ')
      t = t.replace(/\n{3,}/g, '\n\n')
      return t.trim()
    }

    function splitForSpeech(text) {
      const body = String(text || '').replace(/\s+/g, ' ').trim()
      if (!body) return []
      const parts = body.split(/(?<=[。！？!?；;：:])/)
      const out = []
      let buf = ''
      for (const p of parts) {
        if (buf && (buf + p).length > 120) { out.push(buf.trim()); buf = p }
        else buf += p
      }
      if (buf.trim()) out.push(buf.trim())
      return out.filter(Boolean)
    }

    let speaking = false
    function synth() {
      try {
        if (typeof window === 'undefined') return null
        return window.speechSynthesis || null
      } catch (err) { return null }
    }

    function speak(text) {
      const s = synth()
      if (!s) { patch({ status: 'err', note: '此瀏覽器不支援語音朗讀' }); return false }
      const body = ui.stripSources ? stripForSpeech(text) : String(text || '')
      const chunks = splitForSpeech(body)
      if (!chunks.length) { patch({ note: '冇內容可朗讀' }); return false }
      try { s.cancel() } catch (err) {}
      speaking = true
      patch({ status: 'speaking', note: '朗讀中…' })
      let i = 0
      function step() {
        if (i >= chunks.length) {
          speaking = false
          patch({ status: ui.micOn ? 'listening' : 'idle', note: ui.micOn ? '聽緊喚醒詞…' : '待命' })
          return
        }
        const chunk = chunks[i]
        i += 1
        let u = null
        try { u = new SpeechSynthesisUtterance(chunk) } catch (err) { u = null }
        if (!u) { speaking = false; patch({ status: 'err', note: '無法建立朗讀語句' }); return }
        u.lang = 'zh-HK'
        u.rate = 1
        u.pitch = 1
        u.onend = step
        u.onerror = step
        try { s.speak(u) } catch (err) { step() }
      }
      step()
      return true
    }

    function blocksToText(blocks) {
      if (!Array.isArray(blocks)) return ''
      const out = []
      for (const b of blocks) {
        if (b && b.kind === 'text' && typeof b.text === 'string') out.push(b.text)
      }
      return out.join('\n').trim()
    }

    function lastAssistantText(snap) {
      try {
        if (!snap || !snap.nodes) return ''
        const nodes = snap.nodes
        let list = []
        if (typeof nodes.values === 'function') list = Array.from(nodes.values())
        else if (Array.isArray(nodes)) list = nodes
        else if (typeof nodes === 'object') list = Object.keys(nodes).map(function (k) { return nodes[k] })
        let found = ''
        for (const n of list) {
          if (!n || n.kind !== 'assistant-step') continue
          const t = blocksToText(n.data && n.data.blocks)
          if (t) found = t
        }
        return found
      } catch (err) { return '' }
    }

    let recog = null
    let recogWanted = false
    let alive = true
    let prevRunning = false
    let lastSpoken = ''
    const bridgeState = { inputActions: null, chat: null }

    function teardownRecog() {
      recogWanted = false
      if (recog) {
        try { recog.onend = null } catch (err) {}
        try { recog.stop() } catch (err) {}
        recog = null
      }
    }

    function stopRecog() {
      teardownRecog()
      patch({ status: 'idle', note: '麥克風已關' })
    }

    function startRecog() {
      let SR = null
      try {
        if (typeof window === 'undefined') SR = null
        else SR = window.SpeechRecognition || window.webkitSpeechRecognition || null
      } catch (err) { SR = null }
      if (!SR) {
        patch({ micOn: false, status: 'err', note: '此瀏覽器不支援語音辨識（請用 Chrome）' })
        return
      }
      recogWanted = true
      try {
        const r = new SR()
        r.lang = 'zh-HK'
        r.continuous = true
        r.interimResults = false
        r.maxAlternatives = 1
        r.onresult = function (ev) {
          try {
            const res = ev.results[ev.results.length - 1]
            const said = res && res[0] ? String(res[0].transcript || '') : ''
            if (!said) return
            const hit = matchWake(said)
            if (!hit) return
            const tail = said.slice(hit.index + hit.word.length).replace(/^[\s,，。、]+/, '').trim()
            if (tail) deliver(tail)
            else patch({ status: 'listening', note: '聽到「' + hit.word + '」，請講出內容…' })
          } catch (err) {}
        }
        r.onerror = function (ev) {
          const err = ev && ev.error ? String(ev.error) : 'unknown'
          if (err === 'not-allowed' || err === 'service-not-allowed') {
            recogWanted = false
            patch({ micOn: false, status: 'err', note: '麥克風被拒（桌面外殼封鎖 media，請用瀏覽器分頁）' })
          } else {
            patch({ note: '語音辨識：' + err })
          }
        }
        r.onend = function () {
          recog = null
          if (recogWanted && alive) {
            try { startRecog() } catch (err) {}
          }
        }
        recog = r
        r.start()
        patch({ status: 'listening', note: '聽緊喚醒詞…' })
      } catch (err) {
        patch({ micOn: false, status: 'err', note: '無法啟動語音辨識' })
      }
    }

    function deliver(text) {
      const ia = bridgeState.inputActions
      if (!ia || typeof ia.setDraft !== 'function') {
        patch({ status: 'err', note: '麥克風需在有對話輸入框時使用' })
        return
      }
      try {
        ia.setDraft(text)
        if (ui.autoSubmit && typeof ia.submit === 'function') ia.submit()
        patch({ note: ui.autoSubmit ? '已送出：' + text : '已填入輸入框：' + text })
      } catch (err) {
        patch({ status: 'err', note: '寫入輸入框失敗' })
      }
    }

    function loadPersona() {
      fetch(PERSONA_URL, { cache: 'no-store' })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d && typeof d.personaOn === 'boolean') patch({ personaOn: d.personaOn })
        })
        .catch(function () {})
    }

    function togglePersona(next) {
      patch({ personaOn: next })
      fetch(PERSONA_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ on: next }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d && typeof d.personaOn === 'boolean') patch({ personaOn: d.personaOn })
        })
        .catch(function () {})
    }

    function Btn(text, onClick, on, mini) {
      return el('button', {
        type: 'button',
        className: 'dsh-mocha-btn' + (on ? ' is-on' : '') + (mini ? ' is-mini' : ''),
        onClick: onClick,
      }, text)
    }

    function MochaHud() {
      const s = useUi()
      const openPair = React.useState(true)
      const open = openPair[0]
      const setOpen = openPair[1]
      let dot = ''
      if (s.status === 'err') dot = 'is-err'
      else if (s.status === 'speaking') dot = 'is-busy'
      else if (s.status === 'listening' || s.status === 'busy') dot = 'is-live'

      const head = el('div', { className: 'dsh-mocha-head' },
        el('span', { className: 'dsh-mocha-dot ' + dot }),
        el('span', { className: 'dsh-mocha-title' }, 'Mocha'),
        Btn(open ? '▾' : '▸', function () { setOpen(!open) }, false, true))

      if (!open) return el('div', { className: 'dsh-mocha-hud is-collapsed' }, head)

      const body = el('div', { className: 'dsh-mocha-body' },
        el('div', { className: 'dsh-mocha-note' }, s.note),
        el('div', { className: 'dsh-mocha-row' },
          Btn(s.micOn ? '🎤 聽緊' : '🎤 語音', function () {
            if (s.micOn) { patch({ micOn: false }); stopRecog() }
            else patch({ micOn: true })
          }, s.micOn),
          Btn('🔊 朗讀', function () { patch({ autoSpeak: !s.autoSpeak }) }, s.autoSpeak)),
        el('div', { className: 'dsh-mocha-row' },
          Btn('🧹 剝來源', function () { patch({ stripSources: !s.stripSources }) }, s.stripSources),
          Btn('🎭 人格', function () { togglePersona(!s.personaOn) }, s.personaOn)),
        el('div', { className: 'dsh-mocha-row' },
          Btn('🔈 測試', function () { speak('Mocha 語音測試，呢句係粵語朗讀測試句。') }),
          Btn('⏹ 停止', function () {
            const sy = synth()
            if (sy) { try { sy.cancel() } catch (err) {} }
            speaking = false
            patch({ status: 'idle', note: '已停止朗讀' })
          }),
          Btn('自動送出', function () { patch({ autoSubmit: !s.autoSubmit }) }, s.autoSubmit, true)),
        el('input', {
          className: 'dsh-mocha-wake',
          value: s.wakeAlt,
          placeholder: '喚醒詞，逗號或空格分隔',
          onChange: function (e) { patch({ wakeAlt: e.target.value }) },
        }))

      return el('div', { className: 'dsh-mocha-hud' }, head, body)
    }

    function MochaBridge(props) {
      const s = useUi()
      const running = typeof props.useSession === 'function'
        ? props.useSession(function (x) { return x ? x.running : undefined })
        : undefined
      const chat = typeof props.useChat === 'function'
        ? props.useChat(function (x) { return x })
        : null

      bridgeState.inputActions = props.inputActions || null
      bridgeState.chat = chat

      React.useEffect(function () {
        if (s.micOn) startRecog()
        // Only announce a shutdown for a recognition session that actually ran;
        // on first mount `recog` is null and the HUD must keep saying 待命.
        else if (recog) stopRecog()
      }, [s.micOn])

      React.useEffect(function () {
        if (running === true) {
          prevRunning = true
          patch({ status: 'busy', note: '回覆中…' })
          return
        }
        if (running === false && prevRunning) {
          prevRunning = false
          if (!ui.autoSpeak) {
            patch({ status: ui.micOn ? 'listening' : 'idle', note: '回覆完成（朗讀已關）' })
            return
          }
          const text = lastAssistantText(bridgeState.chat)
          if (text && text !== lastSpoken) {
            lastSpoken = text
            speak(text)
          } else if (!text) {
            patch({ status: ui.micOn ? 'listening' : 'idle', note: '回覆完成，但讀唔到內容' })
          }
        }
      }, [running])

      const live = s.status === 'listening' || s.status === 'speaking' || s.status === 'busy'
      return el('button', {
        type: 'button',
        title: 'Mocha 語音助手',
        className: 'dsh-mocha-bridge' + (live ? ' is-live' : ''),
        onClick: function () {
          if (s.micOn) { patch({ micOn: false }); stopRecog() }
          else patch({ micOn: true })
        },
      }, 'Mocha')
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      alive = true

      ctx.effect(() => {
        const styleEl = document.createElement('style')
        styleEl.setAttribute('data-plugin', 'dsh-mocha')
        styleEl.textContent = CSS
        document.head.appendChild(styleEl)
        return () => { if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl) }
      })

      loadPersona()

      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'mocha-hud', order: 55, label: 'Mocha' },
        (props) => el(MochaHud, props),
      ))

      slots.inject('conversation.input.left', () => slots.register(
        { name: 'conversation.input.left', id: 'mocha-bridge', order: 12, label: 'Mocha' },
        (props) => el(MochaBridge, props),
      ))

      ctx.effect(() => () => {
        alive = false
        teardownRecog()
        const sy = synth()
        if (sy) { try { sy.cancel() } catch (err) {} }
        speaking = false
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
