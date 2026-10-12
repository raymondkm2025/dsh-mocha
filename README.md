# dsh-mocha

Mocha —— DeepSeek Harness 的粵語語音助手，以正式插件（bundle）形式安裝，**重啟後不需要重建**。

## 它做什麼

- **Host 半**：註冊 `mocha-voice-interface` 人格提示詞段落（名字為 Mocha、禁止自稱《流浪地球》的 MOSS、不在回覆列出處），並開 `/dsh-mocha/persona` 路由供前端讀寫人格開關。
- **Client 半**：在 `shell.overlay` 註冊浮動 HUD（`mocha-hud`），在 `conversation.input.left` 註冊輸入框橋接掣（`mocha-bridge`）。提供喚醒詞聆聽、粵語朗讀、朗讀前剝來源、人格切換。

## 安裝（一次性，需在使用者終端或 GUI 完成）

Agent 的檔案沙盒只能寫工作區，profile 位於工作區之外，因此**註冊這一步必須由使用者執行**。

編輯 `%APPDATA%\dsh-desktop\harness\profiles\web\package.json`：

1. 在 `dependencies` 加入：

   ```json
   "dsh-mocha": "link:C:/AppDev/DSH_WORKSPACE/dsh-mocha"
   ```

2. 在 `dsh.profile.bundles` 陣列末端加入 `"dsh-mocha"`。

3. 重啟 DSH。

驗證：GUI 右下角應出現「Mocha」浮動面板；輸入框左邊應出現「Mocha」膠囊掣。

亦可改用 GUI 的插件市場安裝，或官方 CLI（`dsh plugin --profile web add ...` 後在 `cordis.patch.yml` 補 insert 行）。

## 使用

| 控制 | 作用 |
| --- | --- |
| 🎤 語音 | 開／關麥克風與喚醒詞聆聽 |
| 🔊 朗讀 | 開／關回覆完成後自動朗讀 |
| 🧹 剝來源 | 朗讀前移除「資料來源／Sources」段落、連結、裸網址與 `[1]` 標記 |
| 🎭 人格 | 開／關 Host 端人格提示詞段落（即時生效） |
| 🔈 測試 | 朗讀一句固定粵語測試句，驗證 TTS |
| ⏹ 停止 | 中斷目前朗讀 |
| 送出 | 開啟後，喚醒詞辨識到的內容會自動送出（預設只填入輸入框） |
| 喚醒詞輸入框 | 以逗號或空格分隔的別名清單，預設 `Mocha, 莫卡, 摩卡, moka`；匹配不分大小寫 |

## 已知限制

- **麥克風只在瀏覽器分頁可用**。DSH Desktop（Electron 外殼）的 `canGrantWindowPermission` 只放行 `clipboard-sanitized-write`，其餘權限（含 `media`）一律拒絕，所以桌面視窗內 `getUserMedia` / `webkitSpeechRecognition` 必然失敗。語音功能請在瀏覽器（Chrome）開啟 GUI 使用；朗讀（`speechSynthesis`）不受此限制。
- 語音辨識需要 Chrome 系瀏覽器提供 `SpeechRecognition` / `webkitSpeechRecognition`。
- 自動朗讀從對話 snapshot 的 `assistant-step` / `data.blocks` 讀取文本；若結構不符，HUD 會顯示「回覆完成，但讀唔到內容」而不會報錯。

## 與舊動態插件的關係

動態 Cordis 插件（`cordis_define` 產出的 Package）只存活於當前進程，DSH 重啟即消失，必須重建。本包是它的持久化版本：同樣的功能改以正式 bundle 形式隨 profile 載入。

若舊的動態插件仍在運行，它註冊的提示詞段落會 shadow 本包的同名段落。建議在安裝本包後停用舊動態插件。
