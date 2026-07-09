# 睡眠與運動時機分析器 Two-Process Model + Exercise Timing (Web)

純 **HTML + CSS + JavaScript** 的單頁網頁版分析器，基於 **Borbély 雙歷程模型 (Two-Process Model of Sleep Regulation)**，並在其上加入了完整的「運動時機建議」與「48 小時急性風險預警」引擎。不需要 Node.js、npm、任何建置工具或伺服器，雙擊 `index.html` 就能在瀏覽器直接開啟使用，也可以直接上傳到 GitHub 並用 GitHub Pages 發佈成一個網址。

> 這個版本是舊版「睡眠分析器」的修正版：問卷擴充為 4 大類即時問項，演算法加入主觀嗜睡度、睡眠效率的個人化修正，並新增運動時機建議引擎（紅黃綠燈）。核心兩歷程模型方程式與參數維持不變、經過自動化測試驗證（見下方「驗證方式」）。運動「類型」問項已移除——文獻顯示種類對睡眠效益的影響不大，不需要讓使用者選擇。

## 功能

- **① 生理時鐘相位校準**：分別詢問「平常幾點起床」與「自由選擇偏好幾點起床」，用兩者差距估算社交時差 (Social Jetlag)，並用「真實偏好起床時間」設定生理時鐘相位，取代舊版只用單一起床時間的粗估法。
- **② 睡眠壓力初始狀態**：用「昨晚上床時間」＋「今天實際起床時間」重建 S(t) 的起始值，不再需要手動輸入「已清醒幾小時」——現在改用裝置的即時時鐘自動計算。
- **③ 簡約版 Epworth 嗜睡量表 (mini-ESS)**：4 題情境評分，總分用來調整清醒期間睡眠壓力的累積斜率。
- **④ 即時睡眠質量數據**：入睡花費時間＋半夜醒來次數，換算成睡眠效率 (SE)，SE 越低，睡眠期間睡眠壓力的清除速率會被下修。「實際睡眠時數」與「躺床總時數」不再需要自己估算輸入，而是由「起床時間 − 上床時間 − 入睡花費時間 − 半夜清醒時間」自動算出，比較符合一般人記得住上床/起床時間、但不一定清楚自己確切睡了幾小時的真實情況。
- **「清醒努力 (Wake Effort)」偵測**：若起床時 S(t) 尚未降到當下的 H− 閾值，判定為「被叫醒」而非自然醒來，會在報表跳出低警覺區警示。
- **運動時機建議**：依劑量反應研究標出綠燈（入睡前 >4h，各強度皆不受影響）／黃燈（2–4h，高強度以上開始漸進式惡化）／紅燈（<2h，所有強度皆明顯惡化）三種運動時機區間；並說明運動「種類」對睡眠效益影響不大，時長越長、越規律效果越好。
- 用純 Canvas 2D（不依賴任何圖表套件）畫出 48 小時睡眠壓力模擬圖，並疊加運動時機色帶。

## 這個模型是什麼？

雙歷程模型主張睡眠時機是兩個歷程交互作用的結果：

- **Process S（恆定歷程 / homeostatic process）**：清醒時上升、睡眠時下降的「睡眠壓力」，以指數方式趨近上下漸近線。
- **Process C（生理時鐘歷程 / circadian process）**：以約 24 小時為週期的振盪，調節「入睡」與「起床」兩個切換閾值的高低。

當 Process S 觸及生理時鐘調節後的上閾值 H+ 時，模型預測會入睡；觸及下閾值 H− 時，模型預測會醒來。`model.js` 內的核心方程式與標準參數（χs = 4.2 h、χw = 18.2 h、H0+ = 0.67、H0- = 0.17、a = 0.12、μ = 1）直接取自：

1. Borbély AA. A two process model of sleep regulation. *Hum Neurobiol.* 1982;1(3):195-204.
2. Daan S, Beersma DGM, Borbély AA. Timing of human sleep: recovery process gated by a circadian pacemaker. *Am J Physiol.* 1984;246(2):R161-83.
3. Skeldon AC, Dijk DJ. The complexity and commonness of the two-process model of sleep regulation from a mathematical perspective. *npj Biol Timing Sleep.* 2025;2:24. doi:[10.1038/s44323-025-00039-z](https://doi.org/10.1038/s44323-025-00039-z)（本文亦是「清醒努力 Wake Effort」這個概念的出處，`model.js`／`app.js` 中的用法直接對應原文用詞。）

以下屬於**本工具在上述方程式之上額外加的工程延伸**，不是論文本身的量化係數，`model.js` 中皆有標註 `DESIGN CHOICE`：

- mini-ESS 對清醒斜率的調整（`essGainMultiplier`）
- 睡眠效率對睡眠期清除速率的調整（`sleepClearanceDivisor`），以及「每次半夜醒來約消耗 5 分鐘」的估計
- 生理時鐘低點時間的估計法（「偏好起床時間 − 2 小時」）

> 年齡對晝夜節律振幅的調整功能已於後續版本移除。

## 重要說明：運動相關建議的出處

- **運動時機劑量反應（綠/黃/紅燈時間切點與各時段效應）**：Leota J, Presby DM, Le F, Czeisler MÉ, Mascaro L, Capodilupo ER, et al. Dose-response relationship between evening exercise and sleep. *Nat Commun.* 2025 Apr 15;16:58271. doi:[10.1038/s41467-025-58271-x](https://doi.org/10.1038/s41467-025-58271-x)
- **運動類型／時長／規律性建議（種類差異不大、時長越長越好、規律優於單次）**：Kline CE, Hillman CH, Bloodgood Sheppard B, Tennant B, Conroy DE, Macko RF, et al. Physical activity and sleep: An updated umbrella review of the 2018 Physical Activity Guidelines Advisory Committee report. *Sleep Med Rev.* 2021;58:101489.

網頁上都會重複提醒：以上皆為自我觀察用的參考資訊，**不是醫療器材，也不能取代睡眠專科醫師或運動醫學專業的診斷與建議**。

## 怎麼開啟使用

**方法一：本機直接開**
雙擊 `index.html`，用瀏覽器（Chrome / Edge / Safari 都可以）打開即可，不需要網路連線。

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
├── index.html   # 頁面結構（4 類問卷、Q&A 區、報表區、圖表 canvas）
├── style.css    # 樣式（含綠/黃/紅燈與風險警示的配色）
├── model.js     # 雙歷程模型數學實作（Process S、Process C、閾值切換模擬、ESS/SE 修正）
├── app.js       # 問卷讀取、報告與運動建議文字產生、canvas 畫圖
├── LICENSE
└── README.md
```

## 驗證方式

這個版本的問卷與運算邏輯改動較大（尤其是「現在時間」已改用裝置即時時鐘，而非手動輸入的已清醒時數），因此不再適用舊版「跟 Python 版本逐項比對」的固定表格——同一組輸入在不同時間點執行，「目前時間」與運動建議時段本來就會不同，這是刻意設計（即時／real-time），不是 bug。

改為採用自動化的無介面瀏覽器測試（Node.js + `jsdom`）驗證：載入 `index.html` → `model.js` → `app.js` 完整流程、點擊「使用範例資料」→「開始分析」，確認：

- `model.js` 的 `TwoProcessModel` 正確掛載到 `window`，`app.js` 呼叫無誤
- 48 小時模擬過程中 S(t)／H+(t)／H−(t) 皆為有效數值（無 `NaN`）
- 依範例資料（平常06:30起床、偏好08:00起床、上床時間00:15、實際06:30起床、ESS總分7/12、入睡花35分鐘、醒來2次）跑出的結果符合預期：躺床總時數6.25h、自動算出實際睡眠5.5h、睡眠效率88%、睡眠負債2.5h、觸發「清醒努力」風險警示、綠燈運動時段的結束時間精確落在「預測入睡時間−4小時」

## 模型限制與已知簡化

- **生理時鐘低點時間仍是經驗法則粗估**：用「偏好起床時間 − 2 小時」估計生理時鐘（核心體溫）低點，這個 2 小時偏移量不是取自論文。
- **ESS 清醒斜率調整、睡眠效率清除速率調整**：皆為本專案自訂的工程公式，方向（嗜睡度高→斜率上升、睡眠效率低→清除變慢）符合一般睡眠生理學常識，但具體係數未經文獻驗證，僅供自我觀察參考。
- **每次半夜醒來估計消耗 5 分鐘**：用於估算睡眠效率，是簡化假設，非實測值。
- 沒有實作論文中提到的光照-生理時鐘-睡眠（HCL）擴充模型，只用原始的雙歷程模型（Process S + Process C + 固定閾值）。
- 這是教育與自我觀察用的小工具，**不是醫療器材，也不能取代睡眠專科醫師或運動醫學專業的診斷或建議**。

## 授權

程式碼採用 MIT 授權（見 `LICENSE`）。文中引用的文獻（Borbély 1982、Daan/Beersma/Borbély 1984、Skeldon & Dijk 2025、Leota et al. 2025、Kline et al. 2021，以及 Wittmann et al. 2006／Johns 1991／Berry et al. 2020 等背景概念出處，完整清單見 `index.html` 頁尾）皆為獨立著作，版權歸原作者與出版社所有，本專案僅在程式內以註解與本 README 引用其方程式與結論並標明出處；使用時請保留引用資訊。
