# 睡眠與運動時機分析器 Two-Process Model + Exercise Timing (Web)

純 **HTML + CSS + JavaScript** 的單頁網頁版分析器，基於 **Borbély 雙歷程模型 (Two-Process Model of Sleep Regulation)**，並在其上加入了完整的「運動時機建議」與「48 小時急性風險預警」引擎。不需要 Node.js、npm、任何建置工具或伺服器，雙擊 `index.html` 就能在瀏覽器直接開啟使用，也可以直接上傳到 GitHub 並用 GitHub Pages 發佈成一個網址。

> 這個版本是舊版「睡眠分析器」的大幅修正版：問卷從 4 題擴充為 5 大類即時問項，演算法加入年齡、主觀嗜睡度、睡眠效率的個人化修正，並新增運動處方引擎（含時機紅黃綠燈）與 PDF 匯出。核心兩歷程模型方程式與參數維持不變、經過自動化測試驗證（見下方「驗證方式」）。

## 功能

- **① 生理時鐘相位校準**：分別詢問「平常幾點起床」與「自由選擇偏好幾點起床」，用兩者差距估算社交時差 (Social Jetlag)，並用「真實偏好起床時間」設定生理時鐘相位，取代舊版只用單一起床時間的粗估法。
- **② 睡眠壓力初始狀態**：用「今天實際起床時間」＋「昨晚實際睡眠時數」重建 S(t) 的起始值，不再需要手動輸入「已清醒幾小時」——現在改用裝置的即時時鐘自動計算。
- **③ 簡約版 Epworth 嗜睡量表 (mini-ESS)**：4 題情境評分，總分用來調整清醒期間睡眠壓力的累積斜率。
- **④ 即時睡眠質量數據**：入睡花費時間＋半夜醒來次數，換算成睡眠效率 (SE)，SE 越低，睡眠期間睡眠壓力的清除速率會被下修。
- **⑤ 運動類型與強度偏好**：結合訓練／阻力訓練／有氧運動 × 高／中／輕強度。
- **年齡調控晝夜節律振幅**：年齡越大，振幅越低、H+/H− 波動越小，用以呈現老年睡眠碎片化的現象。
- **「清醒努力 (Wake Effort)」偵測**：若起床時 S(t) 尚未降到當下的 H− 閾值，判定為「被叫醒」而非自然醒來，會在報表跳出低警覺區警示。
- **運動處方引擎**：依 SUCRA 實證數據推薦運動類型／強度／時長，並在 48 小時時間軸上標出綠燈（>4h）／黃燈（2–4h）／紅燈（<2h）三種運動時機區間。
- **48 小時急性風險預警**：睡眠負債、睡眠效率、清醒努力、睡意指數任一項超標時，跳出情緒調節（杏仁核）與執行功能（前額葉皮質）警示。
- **PDF 匯出**：一鍵下載兩部分報表——第一部分「問題與回答」，第二部分「報表與解析」（含 48 小時圖表圖片）。
- 用純 Canvas 2D（不依賴任何圖表套件）畫出 48 小時睡眠壓力模擬圖，並疊加運動時機色帶。

## 這個模型是什麼？

雙歷程模型主張睡眠時機是兩個歷程交互作用的結果：

- **Process S（恆定歷程 / homeostatic process）**：清醒時上升、睡眠時下降的「睡眠壓力」，以指數方式趨近上下漸近線。
- **Process C（生理時鐘歷程 / circadian process）**：以約 24 小時為週期的振盪，調節「入睡」與「起床」兩個切換閾值的高低。

當 Process S 觸及生理時鐘調節後的上閾值 H+ 時，模型預測會入睡；觸及下閾值 H− 時，模型預測會醒來。`model.js` 內的核心方程式與標準參數（χs = 4.2 h、χw = 18.2 h、H0+ = 0.67、H0- = 0.17、a = 0.12、μ = 1）直接取自：

1. Borbély AA. A two process model of sleep regulation. *Hum Neurobiol.* 1982;1(3):195-204.
2. Daan S, Beersma DGM, Borbély AA. Timing of human sleep: recovery process gated by a circadian pacemaker. *Am J Physiol.* 1984;246(2):R161-83.
3. Skeldon AC, Dijk DJ. The complexity and commonness of the two-process model of sleep regulation from a mathematical perspective. *npj Biol Timing Sleep.* 2025;2:24. doi:[10.1038/s44323-025-00039-z](https://doi.org/10.1038/s44323-025-00039-z)（本文亦是「清醒努力 Wake Effort」這個概念的出處，`model.js`／`app.js` 中的用法直接對應原文用詞。）

以下三項屬於**本工具在上述方程式之上額外加的工程延伸**，不是論文本身的量化係數，`model.js` 中皆有標註 `DESIGN CHOICE`：

- 年齡對振幅 `a` 的調降公式（`ageAmplitudeFactor`）
- mini-ESS 對清醒斜率的調整（`essGainMultiplier`）
- 睡眠效率對睡眠期清除速率的調整（`sleepClearanceDivisor`），以及「每次半夜醒來約消耗 5 分鐘」的估計

## 重要說明：運動與風險相關建議的出處

- **運動處方（SUCRA 排名、黃金處方）**：Li Y, Wang W, Wang W, et al. Effects of different exercise prescriptions on sleep quality: a systematic review and network meta-analysis. *Front Psychol.* 2024;15:1466277.（結合訓練 SUCRA=82.7、高強度 SUCRA=92.9、≤30 分鐘 SUCRA=92.2）
- **黃燈區 36 分鐘延遲、自律神經數據**：Leota J, Presby DM, Le F, Czeisler MÉ, Facer-Childs ER, et al. Exercise timing, strain and nocturnal autonomic activity in free-living conditions. *Nat Commun.* 2025.
- **紅燈區 ≥20 bpm 心率上升、SOL/SE 影響**：Stutz J, Eiholzer R, Spengler CM. Effects of evening exercise on sleep in healthy participants: a systematic review and meta-analysis. *Sports Med.* 2019;49:269-287.
- **急性風險預警（杏仁核反應性、前額葉皮質敏感性）**：取材自一般睡眠剝奪神經科學文獻（例如 Yoo et al., 2007, *Curr Biol*；Killgore, 2010, *Prog Brain Res*），**並非**來自上述三篇運動文獻，也不是本專案原始三篇雙歷程模型文獻的結論。App 內與 PDF 報表中都會另行標註這一點。

網頁與 PDF 上都會重複提醒：以上皆為自我觀察用的參考資訊，**不是醫療器材，也不能取代睡眠專科醫師或運動醫學專業的診斷與建議**。

## 怎麼開啟使用

**方法一：本機直接開**
雙擊 `index.html`，用瀏覽器（Chrome / Edge / Safari 都可以）打開即可。分析功能不需要網路；但「下載完整 PDF 報表」按鈕會從 CDN 載入 jsPDF 套件，需要有網路連線才能匯出 PDF。

**方法二：GitHub Pages（讓別人也能用網址打開）**

1. 把這個資料夾整個 push 到 GitHub repo（例如 `Sleep-Analyzer`）。
2. 到 repo 的 **Settings → Pages**。
3. Source 選擇 **Deploy from a branch**，Branch 選 `main`，資料夾選 `/ (root)`，按 Save。
4. 等 1-2 分鐘，GitHub 會給你一個網址，格式類似：
   `https://<你的帳號>.github.io/Sleep-Analyzer/`
5. 之後每次 push 更新，這個網址的內容會自動同步更新。

## 檔案結構

```
sleep-analyzer-web/
├── index.html   # 頁面結構（5 類問卷、Q&A 區、報表區、圖表 canvas、PDF 按鈕）
├── style.css    # 樣式（含綠/黃/紅燈與風險警示的配色）
├── model.js     # 雙歷程模型數學實作（Process S、Process C、閾值切換模擬、年齡/ESS/SE 修正）─ 之後要搬進 React Native 專案主要就是拿這支檔案的邏輯
├── app.js       # 問卷讀取、報告與運動建議文字產生、canvas 畫圖、jsPDF 匯出
├── LICENSE
└── README.md
```

## 驗證方式

這個版本的問卷與運算邏輯改動較大（尤其是「現在時間」已改用裝置即時時鐘，而非手動輸入的已清醒時數），因此不再適用舊版「跟 Python 版本逐項比對」的固定表格——同一組輸入在不同時間點執行，「目前時間」與運動建議時段本來就會不同，這是刻意設計（即時／real-time），不是 bug。

改為採用自動化的無介面瀏覽器測試（Node.js + `jsdom`）驗證：載入 `index.html` → `model.js` → `app.js` 完整流程、點擊「使用範例資料」→「開始分析」→「下載 PDF」，確認：

- `model.js` 的 `TwoProcessModel` 正確掛載到 `window`，`app.js` 呼叫無誤
- 48 小時模擬過程中 S(t)／H+(t)／H−(t) 皆為有效數值（無 `NaN`）
- 依範例資料（年齡45、平常06:30起床、偏好08:00起床、實際06:30起床、昨晚睡5.5h、ESS總分7/12、入睡花35分鐘、醒來2次、偏好高強度有氧）跑出的結果符合預期：睡眠效率88%、睡眠負債2.5h、觸發「睡眠負債」與「清醒努力」兩則風險警示、綠燈運動時段的結束時間精確落在「預測入睡時間−4小時」
- PDF 匯出流程會產生 3 頁（第一部分問答 1 頁 + 第二部分報表與圖表 1 頁 + 運動建議與名詞解釋 1 頁），且圖表有成功以圖片形式嵌入

## 之後要搬進 React Native / React Native Web

`model.js` 目前是用瀏覽器全域變數 `window.TwoProcessModel` 掛載函式，方便直接用 `<script>` 標籤載入、不需要建置工具。如果要搬進 React Native（Web 或原生）專案：

1. 把 `model.js` 最下面的 `(function(root){...})(window)` 改成標準 ES module 的具名 `export`。裡面所有函式（含新增的 `ageAmplitudeFactor`、`essGainMultiplier`、`sleepClearanceDivisor`）都是純函式，不依賴 DOM，可以直接複製貼上使用。
2. `app.js` 裡跟瀏覽器 DOM（`document.getElementById`、`<canvas>`、`window.jspdf`）綁在一起的部分需要重寫成 React 元件：表單用 `useState` 管理輸入值，報告與運動建議用 JSX 渲染，圖表看你是 React Native Web（可繼續用 Canvas 或改用 Chart.js/Recharts）還是原生 App（改用 `react-native-svg` 或 `Victory Native`），PDF 匯出則可改用 `react-native-html-to-pdf` 或伺服器端產生。

## 模型限制與已知簡化

- **生理時鐘低點時間仍是經驗法則粗估**：用「偏好起床時間 − 2 小時」估計生理時鐘（核心體溫）低點，這個 2 小時偏移量不是取自論文。
- **年齡振幅調降、ESS 清醒斜率調整、睡眠效率清除速率調整**：皆為本專案自訂的工程公式，方向（老化→振幅降低、嗜睡度高→斜率上升、睡眠效率低→清除變慢）符合一般睡眠生理學常識，但具體係數未經文獻驗證，僅供自我觀察參考。
- **每次半夜醒來估計消耗 5 分鐘**：用於估算睡眠效率，是簡化假設，非實測值。
- **急性風險預警不是診斷工具**：杏仁核／前額葉皮質相關警示是一般神經科學文獻的常見發現套用到你的個人數值上，並非針對你個人做的臨床評估。
- 沒有實作論文中提到的光照-生理時鐘-睡眠（HCL）擴充模型，只用原始的雙歷程模型（Process S + Process C + 固定閾值）。
- 這是教育與自我觀察用的小工具，**不是醫療器材，也不能取代睡眠專科醫師或運動醫學專業的診斷或建議**。

## 授權

程式碼採用 MIT 授權（見 `LICENSE`）。文中引用的六篇文獻（Borbély 1982、Daan/Beersma/Borbély 1984、Skeldon & Dijk 2025、Li et al. 2024、Leota et al. 2025、Stutz et al. 2019）皆為獨立著作，版權歸原作者與出版社所有，本專案僅在程式內以註解與本 README 引用其方程式與結論並標明出處；使用時請保留引用資訊。
