# 調音器 Tuner（PWA）

[節拍器 Metronome](https://github.com/sychen6192/metronome) 的雙胞胎：同一塊音樂教室黑板、同一套樂譜字型、同一個黃色。這是一個精準、可安裝、可離線使用的半音階調音器。純 TypeScript，無 UI 框架，打包後 JS 約 25 KB（gzip，含分析用的 Worker 與 Service Worker 註冊）。

## 功能

- **0.1 音分的讀數**：在 A0–C8 範圍內，純音的偵測誤差低於 0.01 音分；有雜訊、會衰減的撥弦音低於 0.3 音分（見下方〈準確度〉）。
- **低音弦不會跳八度**：基音很弱、第二泛音比基音還強的低音弦，照樣讀對；換成樂器模式時，偵測範圍會縮到該樂器的音域。
- **真頻閃（True strobe）**：三條頻閃帶，分別量基音、八度和兩個八度的相位。音準時靜止，偏高往右、偏低往左流動，原理和 Peterson 頻閃調音器相同。
- **音準筆跡**：黃色筆尖沿著音分刻度移動，紙往下捲動，畫出最近 6 秒的音高。
  - 準確的長音是一條直直落下的線；顫音會左右擺動。
  - 每個音的開頭會標上音名。
  - 線條粗細代表偵測的把握度。
- **顫音判中心**：讀數和「準了」的判定都用音高中心（半秒內的加權平均），所以有顫音的小提琴或人聲，只要中心準就算準。轉弦鈕時，讀數照樣即時跟上。
- **準了就填滿**：音高穩定落在容許範圍內約 0.25 秒後，音名圓盤會變成實心，聲音停了之後仍保持一下。容許範圍可選 ±1、2、3、5、10 音分。
- **20 種樂器調弦**：
  - 吉他：標準、Drop D、降半音、DADGAD、Open G、Open D、七弦
  - 貝斯：四弦、五弦
  - 烏克麗麗：標準、Low G、Baritone
  - 弦樂：小提琴、中提琴、大提琴、低音提琴
  - 其他：曼陀林、五弦斑鳩琴、二胡、琵琶

  可以自動判斷正在彈哪一條弦，或點弦名鎖定。
- **鎖定目標音**：半音階模式下用 ♭／♯ 鍵選定目標音，例如唱歌練長音。點音名圓盤可以鎖定或解除。
- **標準音 390–490 Hz，以 0.1 Hz 為單位**（巴洛克 A = 415、樂團 442 等都能設）。
- **從聲音校準**：按「校準」後演奏一個 A，例如雙簧管或鋼琴的 A，就會把它設成標準音，事後也可以復原。
- **7 種律制**：十二平均律、純律、畢氏律、¼ 音差中全音律、韋克邁斯特 III、基恩貝格 III、瓦洛蒂。純律、畢氏律和中全音律可以選主音；A 永遠維持在標準音。
- **移調樂器**：C、B♭（小號、單簧管）、A、F（法國號）、E♭（中音薩克斯風）。畫面顯示的是記譜音。
- **音名**：字母 C D E 或固定唱名 Do Re Mi；升降號可選常用拼法、全用升記號或全用降記號。畫面上的升降號是刻版字型，不是系統的 Unicode 符號（只有系統原生的下拉選單用系統字型）；刻版字型被擋時會換成 # 和 b。
- **參考音**：持續發出目標音，讓你用耳朵對音。
  - 跟隨律制和標準音。
  - 有簧片音色和正弦波可選。簧片音色帶泛音，手機喇叭也聽得到低音 E。
  - iOS 靜音模式下仍會發聲。
- **靈敏度**：拖動調整收音門檻，旁邊的指示燈亮起代表麥克風有聽到你。
- 聆聽或發聲時**螢幕保持開啟**；切到背景時會**釋放麥克風**，回來後自動繼續聽。
- 設定自動儲存。介面依瀏覽器語系切換繁體中文或英文，深淺色跟隨系統。支援螢幕閱讀器（會朗讀「A4 偏高 3 音分」）、減少動態效果和 Windows 高對比模式。
- **PWA**：可以安裝到主畫面，完全離線可用；有新版本時提示重新載入，調音中不會被強制刷新。

快捷鍵：

| 按鍵 | 功能 |
| --- | --- |
| `空白鍵` | 開始／停止 |
| `← →` | 選音或選弦 |
| `Esc` | 恢復自動 |
| `↑ ↓` | 標準音 ±1 Hz（按住 `Shift` 為 ±0.1） |
| `R` | 參考音 |
| `C` | 校準 |

`R`、`C` 這兩個字母快捷鍵可以在設定最下方關掉，以免語音輸入誤觸（WCAG 2.1.4）。

## 和熱門開源調音器比較

GitHub 星數取自 2026-10-16。

| 專案 | ★ | 平台 | 偵測方式 | 常見問題（多來自它們的 issue） | 本專案的做法 |
| --- | --- | --- | --- | --- | --- |
| [cwilso/PitchDetect](https://github.com/cwilso/PitchDetect) | 1.4k | 網頁 demo | ACF2+ 自相關，2048 點 AnalyserNode | 低音跳八度（#29），不準（#11），沒有平滑 | MPM＋多週期精修＋低音長視窗，[逐行移植它的演算法](tests/support/acf2plus.ts)做對照測試 |
| [googlearchive/guitar-tuner](https://github.com/googlearchive/guitar-tuner) | 855 | 網頁（已封存） | 只用整數延遲的 AMDF | 只支援吉他，低音 E 被讀成高音 E（#21） | 20 種樂器加半音階，次取樣精度 |
| [jpsim/ZenTuner](https://github.com/jpsim/ZenTuner) | 575 | iOS／macOS | Csound ptrack | 不能改 A4（#89），沒有律制 | 390–490 Hz、從聲音校準、7 種律制 |
| [qiuxiang/tuner](https://github.com/qiuxiang/tuner) | 381 | 網頁 | aubio YINFFT，ScriptProcessor | 指針太跳（#7），低音不準（#8、#9），沒關掉瀏覽器語音處理，無 PWA | One Euro 平滑加顫音判中心；關閉回音消除、降噪和自動增益並檢查實際設定；AudioWorklet；可離線 |
| [thetwom/Tuner](https://github.com/thetwom/Tuner) | 303 | Android | 自相關＋FFT | 低音 E、G3/G4 跳八度（#88），背景雜訊下會抖（#72） | 八度防護（泛音判斷＋前一音提示）、門檻與清晰度雙重閘門 |
| [billthefarmer/tuner](https://github.com/billthefarmer/tuner) | 198 | Android | FFT＋相位 | 介面老舊 | 一樣有真頻閃和律制，外加手機優先的現代介面 |

上面這些專案都沒有發表準確度數據，網頁版的也都沒有 PWA。本專案把準確度寫成測試（`npm run benchmark`），每次 CI 都會跑。

## 準確度

用合成的錄音比較本專案和 cwilso/PitchDetect 的 ACF2+。兩邊都只做單次分析、都不平滑，48 kHz：

| 訊號 | 本專案：平均／最大誤差（音分） | 本專案：音名錯誤 | cwilso ACF2+：平均／最大誤差（音分） | cwilso ACF2+：音名錯誤 |
| --- | --- | --- | --- | --- |
| 純音 A0–C8 | 0.00 / 0.00 | 0 / 300 | 3.10 / 26.28 | 39 / 300 |
| 吉他弦（基音弱、衰減、雜訊） | 0.01 / 0.08 | 0 / 60 | 0.72 / 2.88 | 0 / 60 |
| 貝斯弦 B0–G2 | 0.04 / 0.26 | 0 / 50 | 7.27 / 47.95 | 6 / 50 |
| 缺基音 | 0.00 / 0.02 | 0 / 40 | 0.41 / 1.51 | 0 / 40 |
| 類人聲、訊雜比約 14 dB | 0.10 / 0.92 | 0 / 60 | 1.52 / 3.96 | 0 / 60 |

畫面上的讀數還會再經過平滑（見 `tests/tracker.test.ts`）。偵測每幀本身約有 ±0.3 音分的雜訊，平滑後持續音的數字約 ±0.05 音分、筆跡約 ±0.07 音分；就算輸入每幀抖到 ±2 音分，數字也只在約 ±0.4 音分內。轉弦鈕時，讀數落後約 25 ms。

## 參考的 Best Practice

| 主題 | 參考來源 | 本專案的做法 |
| --- | --- | --- |
| 音高偵測 | McLeod & Wyvill〈[A Smarter Way to Find Pitch](https://www.cs.otago.ac.nz/tartini/papers/A_Smarter_Way_to_Find_Pitch.pdf)〉（Tartini、TarsosDSP 採用） | 用 FFT 算 NSDF，取第一個達最高峰 93% 的 key maximum，再做拋物線內插。週期的每一次重複（2T、3T…）都拿來做最小平方擬合，誤差隨重複次數縮小。低音再用 180 ms 的長視窗量一次。 |
| 八度錯誤 | thetwom/Tuner #88、cwilso #29 的使用者回報 | 某個週期若在兩倍長度上重複得明顯更好，就判定它只是真正週期的一半。和前一個音剛好差八度的讀數會先複查；樂器模式下，偵測範圍限制在最低弦往下五度到最高弦往上十二度。 |
| 麥克風 | MDN〈MediaTrackConstraints〉、WebKit bug 179411／281978 | 關閉回音消除、降噪、自動增益和語音隔離，並用 `getSettings()` 檢查瀏覽器是否照做，沒照做就提示。立體聲輸入取較大聲的聲道，因應某些手機只把麥克風放在單一聲道。 |
| 執行緒 | ScriptProcessorNode 已棄用 | AudioWorklet 在音訊執行緒只負責切片，透過 MessagePort 直接送到 Web Worker 做分析，主執行緒只負責畫面。 |
| 平滑 | Casiez 等〈[1€ Filter](https://gery.casiez.net/1euro/)〉（CHI 2012） | 截止頻率隨變化速度提高：靜止的音大幅平滑，轉弦鈕時立刻跟上。單一異常幀會丟掉，持續三幀的新音高才算換音。 |
| 頻閃 | Peterson 頻閃調音器、[x42 Tuna](https://github.com/x42/tuna.lv2) | 每條頻閃帶在音訊時鐘上，以目標音的第 k 泛音做 Hann 窗解調，取得相位，所以流動速度就是 k·Δf。 |
| 律制 | Werckmeister（1691）、Kirnberger（1779）、Vallotti 的原始表 | 純律、畢氏律、中全音律依主音計算；韋克邁斯特、基恩貝格、瓦洛蒂用已發表的音分表。全部以 A 為基準正規化。 |
| PWA | 和節拍器相同：[vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa)＋Workbox | 預先快取、`registerType: 'prompt'`、每小時檢查更新。 |

## 開發

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev        # 開發伺服器（麥克風需要 localhost 或 HTTPS）
npm test           # 單元測試（Vitest），含準確度對照
npm run benchmark  # 印出上面的準確度表格
npm run build      # 型別檢查 + 正式建置到 dist/
npm run preview    # 預覽正式版（Service Worker 只在正式版啟用）
npm run icons      # 重新產生所有圖示（來源是 scripts/generate-icons.mjs 裡的向量圖）
```

字型子集用 `python3 scripts/build-fonts.py Bravura.woff2 NotoSerifTC-Bold.otf` 重建（需要 fonttools 和 brotli）。

> 瀏覽器的自動播放與權限政策規定：麥克風和聲音都必須由使用者操作（點擊或按鍵）啟動。

## 部署

和節拍器相同。`main` 分支有新 commit 時，兩個 workflow 會各自測試、建置並發布。PWA 需要 HTTPS，麥克風也需要（`localhost` 除外）。

### GitHub Pages（`.github/workflows/deploy.yml`）

1. **Settings → General → Default branch** 設為 `main`。
2. **Settings → Pages → Source** 設為 **GitHub Actions**。
3. 網址：`https://<帳號>.github.io/tuner/`。

### Cloudflare Workers（`.github/workflows/deploy-cloudflare.yml`）

在 repo 新增 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID` 這兩個 secrets 就會部署（步驟見節拍器的 README）。沒設定 secrets 前會略過，不會失敗。網址：`https://tuner.<你的子網域>.workers.dev`。

### 其他靜態主機

用 `BASE_PATH=/tuner/ npm run build` 指定子路徑，預設為 `/`。

## 專案結構

```
src/
  core/        純邏輯，無 DOM，可單元測試
    pitch.ts         MPM 音高偵測（NSDF、多週期精修、低音長視窗、八度防護）
    fft.ts           自相關用的 FFT
    strobe.ts        真頻閃：各泛音相對於目標音的相位
    tracker.ts       把每幀讀數變成畫面狀態（閘門、換音判定、1€ 平滑、顫音判中心、準了）
    notes.ts         音名、律制、移調、頻率換算
    instruments.ts   樂器調弦與偵測範圍
    calibrate.ts     從聽到的 A 校準標準音
    settings.ts      設定的預設值、驗證、儲存
  audio/
    capture.worklet.ts  音訊執行緒：混成單聲道、切片
    analysis.worker.ts  分析執行緒：偵測＋頻閃
    engine.ts           麥克風、AudioContext、錯誤處理
    tone.ts             參考音
  platform/    PWA、Screen Wake Lock、iOS Audio Session
  ui/          音準筆跡圖、音名排版、提示訊息
  main.ts      介面綁定
tests/         Vitest 單元測試與準確度對照（tests/support 是合成訊號和 cwilso 演算法的移植）
```

## 授權

字型：

- Bravura（Steinberg，SIL OFL 1.1）的升降記號子集，改名為 Tuner Engraved。
- Old Standard TT（SIL OFL 1.1）。
- Noto Serif TC Bold（SIL OFL 1.1）裡「調音器」三個字的子集，改名為 Tuner Wordmark。

授權條款在 `src/fonts/`。

`tests/support/acf2plus.ts` 移植自 cwilso/PitchDetect（MIT），只用於對照測試，不會打包進 App。
