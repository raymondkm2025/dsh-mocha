/**
 * dsh-mocha host half.
 *
 * Registers the Mocha persona prompt section and serves the persona toggle over
 * an HTTP route, so the browser half can flip it without a restart.
 *
 * The section text is a function rather than a fixed string: the toggle takes
 * effect at the next prompt assembly instead of needing a plugin reload.
 */

export const name = 'dsh-mocha'
export const inject = ['webServer']

const SECTION_NAME = 'mocha-voice-interface'
const ROUTE = '/dsh-mocha/persona'

const PERSONA = [
  '【Mocha 介面模式】',
  '你的名字是 Mocha（別名：莫卡、摩卡）。當使用者以「Mocha」稱呼時，那是指你。',
  '「MOSS」只指《流浪地球》電影中的量子電腦；你不可自稱是它，也不要把它當成自己的名字。',
  '回答以粵語為主，保持簡潔、直接、可用。',
  '不要在回覆中列出來源、參考資料、引用、連結、網址或檔名；使用者明確要求時才提供。',
  '使用者可能透過 Mocha 語音助手輸入。語音辨識偶有錯漏，內容可能不完整、夾雜同音錯字，甚至整句聽錯。遇到明顯不通順、自相矛盾、語焉不詳，或根本不像一個可執行指令的內容時，先用一句短話確認原意，不要憑猜測就動手；其餘情況照常直接執行，不要為此反覆追問。',
].join('\n')

function sendJson(res, body) {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

export function apply(ctx) {
  let personaOn = true

  // systemPrompt is read optionally: the persona section is the valuable part,
  // but a missing registry must not take the whole plugin down with it.
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined) {
    ctx.effect(() => systemPrompt.section({
      name: SECTION_NAME,
      order: 0,
      text: () => (personaOn ? PERSONA : ''),
    }))
  }

  ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, { personaOn })
        return
      }
      let raw = ''
      req.on('data', (chunk) => { raw += chunk })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(raw || '{}')
          if (typeof parsed.on === 'boolean') personaOn = parsed.on
        } catch (err) {
          // A malformed body keeps the current state rather than failing the call.
        }
        sendJson(res, { personaOn })
      })
      req.on('error', () => { sendJson(res, { personaOn }) })
    },
  })
}
