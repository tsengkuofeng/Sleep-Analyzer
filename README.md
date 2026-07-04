# 睡眠分析器（網頁版） Two-Process Model Sleep Analyzer (Web)

純 **HTML + CSS + JavaScript** 的單頁網頁版睡眠分析器，基於 **Borbély 雙歷程模型 (Two-Process Model of Sleep Regulation)**。不需要 Node.js、npm、任何建置工具或伺服器，雙擊 `index.html` 就能在瀏覽器直接開啟使用，也可以直接上傳到 GitHub 並用 GitHub Pages 發佈成一個網址。

> 這個版本取代了先前的 Python 命令列版本（`two_process_model.py` / `sleep_analyzer.py`），改寫成純 JavaScript，方便之後移植進 React Native / React Native Web 專案。核心運算邏輯已經過對照驗證，跟 Python 版本算出來的數字完全一致（見下方「驗證方式」）。

## 功能

- 表單詢問幾個作息問題（平常起床時間、已清醒時數、最近平均睡眠、目標睡眠時數）
- 計算並顯示：
  - 目前睡意指數 (0-100)
  - 預測的自然入睡 / 起床時間與睡眠長度
  - 粗略睡眠負債估算
  - 粗略時型 (chronotype) 判斷
  - 模型的自然睡眠週期 (`T_sleep` / `T_wake` / `T_nat`)
  - 建議運動時機（延伸推論，見下方「重要說明」）
- 用純 Canvas 2D（不依賴任何圖表套件）畫出 48 小時睡眠壓力模擬圖

## 這個模型是什麼？

雙歷程模型主張睡眠時機是兩個歷程交互作用的結果：

- **Process S（恆定歷程 / homeostatic process）**：清醒時上升、睡眠時下降的「睡眠壓力」，以指數方式趨近上下漸近線。
- **Process C（生理時鐘歷程 / circadian process）**：以約 24 小時為週期的振盪，調節「入睡」與「起床」兩個切換閾值的高低。

當 Process S 觸及生理時鐘調節後的上閾值時，模型預測會入睡；觸及下閾值時，模型預測會醒來。`model.js` 內的所有方程式與標準參數（χs = 4.2 h、χw = 18.2 h、H0+ = 0.67、H0- = 0.17、a = 0.12）皆直接取自下列文獻：

1. Borbély AA. A two process model of sleep regulation. *Hum Neurobiol.* 1982;1(3):195-204.
2. Borbély AA. The two-process model of sleep regulation: beginnings and outlook. *J Sleep Res.* 2022;31(4):e13598.
3. Skeldon AC, Dijk DJ. The complexity and commonness of the two-process model of sleep regulation from a mathematical perspective. *npj Biol Timing Sleep.* 2025;2:24. doi:[10.1038/s44323-025-00039-z](https://doi.org/10.1038/s44323-025-00039-z)

（第 3 篇文獻的作者與 DOI 已對照原始 PDF 與線上搜尋核實過，跟一開始提供的引用資訊不同，這裡採用核實後的正確版本。）

## 重要說明：運動時機建議並非來自論文本身

上述三篇文獻**完全沒有討論運動**。「建議運動時機」是在模型輸出上額外加的簡單延伸推論：在預測的清醒時段中，尋找模型計算出的「距離入睡閾值最遠」(`H+(t) - S(t)` 最大) 的時間點，把它當作「日間警覺度最高」的替代指標。這只是一個與模型自洽的粗略推論，**不是**論文結論，也不是經過驗證的運動生理學建議，僅供參考。網頁上也會再次提醒這一點。

## 怎麼開啟使用

**方法一：本機直接開**
雙擊 `index.html`，用瀏覽器（Chrome / Edge / Safari 都可以）打開即可，不需要安裝任何東西。

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
├── index.html   # 頁面結構（表單、結果區、圖表 canvas）
├── style.css    # 樣式
├── model.js     # 雙歷程模型數學實作（Process S、Process C、閾值切換模擬）─ 之後要搬進 React Native 專案主要就是拿這支檔案的邏輯
├── app.js       # 表單邏輯、報告文字產生、canvas 畫圖
├── LICENSE
└── README.md
```

## 驗證方式（跟 Python 版本比對數字）

這支 JS 版本是從先前驗證過的 Python 版本（`two_process_model.py` / `sleep_analyzer.py`）逐行對照改寫的。用相同的範例輸入（平常起床 07:00、已清醒 6 小時、最近平均睡眠 6.5 小時、目標睡眠 8 小時）跑兩邊，結果完全一致：

| 項目 | Python 版 | JS 版 |
|---|---|---|
| 睡意指數 | 35 | 35 |
| 預測入睡時間 | 23:18 | 23:18 |
| 預測起床時間 | 07:58 | 07:58 |
| 預測睡眠長度 | 8.7 h | 8.7 h |
| 自然週期 T_sleep/T_wake/T_nat | 5.8 / 16.8 / 22.5 h | 5.8 / 16.8 / 22.5 h |
| 建議運動時機 | 14:01 | 14:01 |

## 之後要搬進 React Native / React Native Web

`model.js` 目前是用瀏覽器全域變數 `window.TwoProcessModel` 掛載函式，方便直接用 `<script>` 標籤載入、不需要建置工具。如果要搬進 React Native（Web 或原生）專案：

1. 把 `model.js` 最下面的 `global.TwoProcessModel = {...}` 改成 `export default {...}` 或個別 `export function ...`，變成標準 ES module。
2. `app.js` 裡跟瀏覽器 DOM（`document.getElementById`、`<canvas>`）綁在一起的部分（表單讀取、報告文字產生、Canvas 畫圖）需要重寫成 React 元件：表單用 `useState` 管理輸入值，報告用 JSX 渲染，圖表則看你是 React Native Web（可以繼續用 Canvas 或改用 Chart.js/Recharts）還是原生 App（改用 `react-native-svg` 或 `Victory Native`）。
3. 純數學運算的部分（`circadianC`、`upperThreshold`、`sDuringWake`、`simulate`、`naturalPeriod` 等）完全不需要修改，可以直接複製貼上使用。

## 模型限制與已知簡化

- **生理時鐘低點時間是用經驗法則粗估的**：用「平常起床時間 − 2 小時」估計生理時鐘（核心體溫）低點，這個 2 小時偏移量**不是**取自論文，只是常見的粗略經驗法則。
- **目前睡眠壓力的起始值是假設出來的**：假設上次自然醒來時 S(t) 剛好等於下閾值 H0-，再用清醒時間往前推算，這是簡化假設，不是實際生理量測值。
- 沒有實作論文中提到的光照-生理時鐘-睡眠（HCL）擴充模型，只用原始的雙歷程模型（Process S + Process C + 固定閾值）。
- 這是教育與自我觀察用的小工具，**不是醫療器材、也不能取代睡眠專科醫師的診斷或建議**。

## 授權

程式碼採用 MIT 授權（見 `LICENSE`）。上述三篇文獻皆為獨立著作，版權歸原作者與出版社所有，本專案僅在程式內以註解與本 README 引用其方程式與結論並標明出處；使用時請保留引用資訊。
