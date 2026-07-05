/*
 * app.js
 *
 * UI logic for the browser-based sleep + exercise-timing analyzer. Reads
 * the extended questionnaire, runs the two-process model (model.js), and
 * renders the Q&A + report + 48h chart + exercise-timing advice.
 *
 * SOURCING NOTE:
 * - Two-process model math: Borbély & Daan 1984; Skeldon & Dijk 2025 (see
 *   model.js header). The "wake effort" concept is taken directly from
 *   Skeldon & Dijk's terminology.
 * - Exercise type/duration guidance: Li et al., Front Psychol 2024;15:1466277.
 * - Exercise-timing "yellow zone" delay (~36 min) and autonomic effects:
 *   Leota et al., Nat Commun 2025.
 * - "Red zone" bedtime heart-rate elevation (>=20 bpm) and SOL/SE effects:
 *   Stutz, Eiholzer & Spengler, Sports Med 2019;49:269-287.
 * - Age-amplitude adjustment, ESS wake-gain adjustment, SE-based clearance
 *   adjustment: engineering DESIGN CHOICES documented in model.js, not
 *   coefficients taken from any cited paper.
 */

(function () {
  "use strict";
  const M = window.TwoProcessModel;
  let lastAnalysis = null;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function parseTimeInput(value, fallback) {
    if (!value) return fallback;
    const parts = value.split(":");
    if (parts.length < 2) return fallback;
    const h = parseFloat(parts[0]), m = parseFloat(parts[1]);
    if (isNaN(h) || isNaN(m)) return fallback;
    return ((h + m / 60.0) % 24 + 24) % 24;
  }
  function fmtClock(hours) {
    let h24 = ((hours % 24) + 24) % 24;
    let h = Math.floor(h24), m = Math.round((h24 - h) * 60);
    if (m === 60) { m = 0; h = (h + 1) % 24; }
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  function readFloat(id, fallback) {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? fallback : v;
  }
  function wrapDiff(a, b) { // a-b wrapped into [-12,12]
    return ((a - b + 12) % 24 + 24) % 24 - 12;
  }
  function sleepinessIndex(s, hMinus, hPlus) {
    if (hPlus <= hMinus) return 0;
    return Math.max(0, Math.min(100, ((s - hMinus) / (hPlus - hMinus)) * 100));
  }

  // Builds a collapsible accordion from an array of [label, value] pairs.
  // Each row starts collapsed; click the row (summary) to expand/collapse
  // independently. Used for the report data list and the glossary so long
  // values never get squeezed into a narrow fixed-width column.
  function buildAccordion(items) {
    const acc = document.createElement("div");
    acc.className = "accordion";
    items.forEach(([label, value]) => {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = label;
      const body = document.createElement("div");
      body.className = "acc-body";
      body.textContent = value;
      details.appendChild(summary);
      details.appendChild(body);
      acc.appendChild(details);
    });
    return acc;
  }

  // ---- Exercise zone classification --------------------------------
  // gap = hours until the next predicted sleep onset. Thresholds follow
  // Leota et al. 2025 (2-h exercise-timing bins relative to habitual sleep
  // onset) and Stutz et al. 2019 (bedtime HR elevation thresholds).
  function classifyZone(gap) {
    if (gap === null) return "green";
    if (gap >= 4) return "green";
    if (gap >= 2) return "yellow";
    return "red";
  }
  function nextOnsetGap(t, sleepIntervals) {
    for (const [on] of sleepIntervals) {
      if (on >= t) return on - t;
    }
    return null;
  }
  function findGreenWindow(points, sleepIntervals) {
    let best = null, curStart = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const gap = p.asleep ? -1 : nextOnsetGap(p.t, sleepIntervals);
      const isGreen = !p.asleep && ((gap !== null && gap >= 4) || gap === null);
      if (isGreen) {
        if (curStart === null) curStart = p.t;
      } else if (curStart !== null) {
        const dur = p.t - curStart;
        if (dur >= 0.3 && (best === null || curStart < best.start)) best = { start: curStart, end: p.t, dur };
        curStart = null;
      }
    }
    if (curStart !== null) {
      const end = points[points.length - 1].t;
      best = best || { start: curStart, end, dur: end - curStart };
    }
    return best;
  }

  function essLabel(score) {
    if (score <= 3) return "偏低（白天警覺度尚可）";
    if (score <= 6) return "中等（一般範圍）";
    if (score <= 9) return "偏高（白天嗜睡傾向明顯）";
    return "高（建議留意整體睡眠量是否足夠）";
  }
  function chronotypeLabel(circMin) {
    if (circMin <= 4.0 || circMin >= 22.0) return "偏向「早鳥型」：生理時鐘低點較早";
    if (circMin > 4.0 && circMin <= 5.5) return "中間型，稍偏早鳥";
    if (circMin > 5.5 && circMin <= 7.0) return "中間型";
    return "偏向「夜貓型」：生理時鐘低點較晚";
  }

  // ------------------------------------------------------------------
  // Main analysis
  // ------------------------------------------------------------------
  function analyze() {
    const age = readFloat("age", 30);
    const desiredSleep = readFloat("desiredSleep", 8);
    const habitualWake = parseTimeInput(document.getElementById("habitualWake").value, 7.0);
    const preferredWake = parseTimeInput(document.getElementById("preferredWake").value, 7.0);
    const actualWakeToday = parseTimeInput(document.getElementById("actualWakeToday").value, 7.0);
    const actualSleepHours = readFloat("actualSleepHours", 6.5);
    const ess = ["ess1", "ess2", "ess3", "ess4"].map(id => parseInt(document.getElementById(id).value, 10));
    const essScore = ess.reduce((a, b) => a + b, 0);
    const essMax = 12;
    const sleepLatencyMin = readFloat("sleepLatency", 20);
    const awakenings = readFloat("awakenings", 1);
    const exerciseType = document.getElementById("exerciseType").value;

    const socialJetlag = wrapDiff(habitualWake, preferredWake); // + = wakes earlier than true preference
    const circadianMinTime = ((preferredWake - 2.0) % 24 + 24) % 24;

    const params = M.defaultParams();
    params.circadianMinTime = circadianMinTime;
    params.ageAmplitudeFactor = M.ageAmplitudeFactor(age);
    params.wakeGainMultiplier = M.essGainMultiplier(essScore, essMax);

    const sleepLatencyH = sleepLatencyMin / 60;
    const wasoH = awakenings * (5 / 60); // DESIGN CHOICE: ~5 min per awakening
    const timeInBed = actualSleepHours + sleepLatencyH + wasoH;
    const sleepEfficiency = timeInBed > 0 ? Math.max(0, Math.min(1, actualSleepHours / timeInBed)) : 1;
    params.sleepClearanceDivisor = M.sleepClearanceDivisor(sleepEfficiency);

    // S at last night's sleep onset ~ upper threshold at that clock time
    const sleepOnsetClockLastNight = ((actualWakeToday - timeInBed) % 24 + 24) % 24;
    const sAtSleepOnset = M.upperThreshold(sleepOnsetClockLastNight, params);
    const sAtWakeToday = M.sDuringSleep(timeInBed, 0, sAtSleepOnset, params);

    // Wake-effort check: was S still above the lower threshold at actual wake time?
    const hMinusAtWake = M.lowerThreshold(actualWakeToday, params);
    const wakeEffort = sAtWakeToday > hMinusAtWake;

    // "Now" = real current local time (real-time input, per spec)
    const now = new Date();
    const nowClockRaw = now.getHours() + now.getMinutes() / 60;
    let elapsedSinceWake = nowClockRaw - actualWakeToday;
    if (elapsedSinceWake < 0) elapsedSinceWake += 24;
    if (elapsedSinceWake > 20) elapsedSinceWake = elapsedSinceWake % 24; // guard against stale-day inputs
    const nowClock = actualWakeToday + elapsedSinceWake;
    const sNow = M.sDuringWake(elapsedSinceWake, 0, sAtWakeToday, params);

    const result = M.simulate(params, sNow, false, 48.0, 0.02, nowClock);
    const [tSleepNat, tWakeNat, tNat] = M.naturalPeriod(params);

    lastAnalysis = {
      inputs: { age, desiredSleep, habitualWake, preferredWake, actualWakeToday, actualSleepHours,
                ess, essScore, sleepLatencyMin, awakenings, exerciseType },
      derived: { socialJetlag, circadianMinTime, sleepEfficiency, wakeEffort, nowClock, nowDate: now, sNow,
                 essMax, tSleepNat, tWakeNat, tNat, ageAmplitudeFactor: params.ageAmplitudeFactor },
      result,
    };

    renderQA(lastAnalysis);
    renderReport(lastAnalysis);
    document.getElementById("resultsSection").hidden = false;
    document.getElementById("reportSection").hidden = false;
  }

  // ------------------------------------------------------------------
  function renderQA(a) {
    const el = document.getElementById("qaList");
    el.innerHTML = "";
    const rows = [
      ["年齡", a.inputs.age + " 歲"],
      ["目標睡眠時數", a.inputs.desiredSleep + " 小時"],
      ["平常幾點起床（社交時間表）", fmtClock(a.inputs.habitualWake)],
      ["自由選擇偏好幾點起床（真實時型）", fmtClock(a.inputs.preferredWake)],
      ["今天實際起床時間", fmtClock(a.inputs.actualWakeToday)],
      ["昨晚實際睡眠時數", a.inputs.actualSleepHours + " 小時"],
      ["ESS - 坐著閱讀時打瞌睡機率", a.inputs.ess[0]],
      ["ESS - 看電視時打瞌睡機率", a.inputs.ess[1]],
      ["ESS - 公共場所安靜坐著打瞌睡機率", a.inputs.ess[2]],
      ["ESS - 乘車超過一小時打瞌睡機率", a.inputs.ess[3]],
      ["ESS 總分", a.inputs.essScore + " / " + a.derived.essMax],
      ["昨晚入睡花費時間", a.inputs.sleepLatencyMin + " 分鐘"],
      ["半夜醒來次數", a.inputs.awakenings + " 次"],
      ["偏好運動類型", { combined: "阻力+有氧", resistance: "阻力訓練", aerobic: "有氧運動" }[a.inputs.exerciseType]],
    ];
    rows.forEach(([k, v]) => {
      const div = document.createElement("div");
      div.innerHTML = `<span>${k}</span><span>${v}</span>`;
      el.appendChild(div);
    });
  }

  function renderReport(a) {
    const { inputs, derived, result } = a;
    const reportEl = document.getElementById("report");
    reportEl.innerHTML = "";

    if (!result.sleepIntervals.length) {
      reportEl.textContent = "模型在 48 小時內沒有預測到入睡時間，請檢查輸入的參數是否合理。";
      return;
    }

    const [firstOnset, firstOffset] = result.sleepIntervals[0];
    const paramsNow = {
      chiS: 4.2, chiW: 18.2, hPlus0: 0.67, hMinus0: 0.17, a: 0.12, mu: 1.0,
      circadianMinTime: derived.circadianMinTime, ageAmplitudeFactor: derived.ageAmplitudeFactor,
    };
    const hPlusNow = M.upperThreshold(derived.nowClock, paramsNow);
    const hMinusNow = M.lowerThreshold(derived.nowClock, paramsNow);
    const idx = sleepinessIndex(derived.sNow, hMinusNow, hPlusNow);
    const sleepDebt = Math.max(0, inputs.desiredSleep - inputs.actualSleepHours);

    // ---- Risk warnings ----
    const riskEl = document.getElementById("riskWarnings");
    riskEl.innerHTML = "";
    if (derived.wakeEffort) {
      const box2 = document.createElement("div");
      box2.innerHTML = `
        <div class="risk-box">
          <h4>⚠ 低警覺區（Wake Effort，強制清醒）</h4>
          <p>模型顯示你今天起床時，睡眠壓力 S 尚未降到「自發性醒來」的下限閾值 H−，代表你是被「叫醒」而非自然醒來，此時醒著需要額外的「清醒努力」，接下來一段時間認知功能（反應速度、專注力）可能顯著受影響。</p>
        </div>`;
      riskEl.appendChild(box2);
    }

    // ---- Report list (collapsible accordion) ----
    const lines = [
      ["目前時間（即時）", fmtClock(derived.nowClock)],
      ["目前睡意指數", idx.toFixed(0) + " / 100（0=剛睡飽，100=已達模型入睡閾值）"],
      ["預測今晚入睡時間", fmtClock(firstOnset)],
      ["預測明早起床時間", fmtClock(firstOffset)],
      ["預測睡眠長度", (firstOffset - firstOnset).toFixed(1) + " 小時"],
      ["真實時型（依自由選擇起床時間推算）", chronotypeLabel(derived.circadianMinTime)],
      ["社交時差 (Social Jetlag)", (derived.socialJetlag >= 0 ?
        ("平常比真實偏好早起約 " + derived.socialJetlag.toFixed(1) + " 小時") :
        ("平常比真實偏好晚起約 " + Math.abs(derived.socialJetlag).toFixed(1) + " 小時"))],
      ["主觀嗜睡度 (mini-ESS)", inputs.essScore + " / " + derived.essMax + "　" + essLabel(inputs.essScore)],
      ["睡眠效率 (SE)", (derived.sleepEfficiency * 100).toFixed(0) + "%"],
      ["昨晚睡眠負債", sleepDebt.toFixed(1) + " 小時（相對目標睡眠時數）"],
      ["模型自然睡眠週期", "睡 " + derived.tSleepNat.toFixed(1) + " h + 醒 " + derived.tWakeNat.toFixed(1) + " h = 週期 " + derived.tNat.toFixed(1) + " h"],
    ];
    reportEl.appendChild(buildAccordion(lines));

    drawChart(result, derived.nowClock, derived.nowDate);
    renderExerciseAdvice(a);
    renderGlossary();
  }

  // ------------------------------------------------------------------
  function renderExerciseAdvice(a) {
    const { inputs, result, derived } = a;
    const el = document.getElementById("exerciseAdvice");
    el.innerHTML = "";

    const typeLabel = { combined: "阻力+有氧", resistance: "阻力訓練", aerobic: "有氧運動" };

    const rankBox = document.createElement("div");
    rankBox.className = "info-box";
    rankBox.innerHTML = `
      <h4>黃金處方</h4>
      <p>研究顯示，阻力+有氧一起做，改善睡眠品質的效果優於只做單一種類；單次運動抓「高強度、≤30 分鐘」就好，效果比 40–55 分鐘的中長時間訓練更好。</p>
      <p>你目前偏好「${typeLabel[inputs.exerciseType]}」。${inputs.exerciseType !== "combined" ? "可以考慮改成阻力+有氧一起做，效果會更好。" : "已經是建議的組合。"}</p>
    `;
    el.appendChild(rankBox);

    const green = findGreenWindow(result.points, result.sleepIntervals);
    if (green) {
      const box = document.createElement("div");
      box.className = "exercise-window green";
      box.innerHTML = `<strong>建議運動時段：${fmtClock(green.start)} – ${fmtClock(green.end)}</strong>
        <span class="tag green">全綠燈區</span>
        <p style="margin:8px 0 0">此時段距離預測入睡時間 &gt; 4 小時，這時候做高強度運動不會干擾今晚睡眠。</p>`;
      el.appendChild(box);
    } else {
      el.innerHTML += `<p class="disclaimer">未來 48 小時內找不到明顯的綠燈運動時段，建議優先安排在起床後不久、距離下次預測入睡 4 小時以上的時間。</p>`;
    }

    const yellowBox = document.createElement("div");
    yellowBox.innerHTML = `
      <div class="info-box">
        <h4><span class="tag yellow">黃燈警戒區</span> 入睡前 2–4 小時</h4>
        <p>建議改為中、輕度負荷。若此時仍進行高強度訓練，依 Leota et al. (2025) 資料，運動結束於入睡前 2 小時的情況下，入睡時間平均延後約 <strong>36 分鐘</strong>，且睡眠持續時間縮短、夜間靜息心率上升、心率變異度下降。</p>
      </div>
      <div class="risk-box">
        <h4><span class="tag red">紅燈禁止區</span> 入睡前 &lt; 2 小時</h4>
        <p>嚴禁高強度運動。依 Stutz et al. (2019) 統合分析，睡前劇烈運動可能使就寢時心率較平常增加約 <strong>20 bpm 以上</strong>（部分研究達 26 bpm），顯著延長入睡潛伏期 (SOL) 並降低睡眠效率 (SE)；中低強度運動對睡眠參數影響則不顯著。</p>
      </div>
    `;
    el.appendChild(yellowBox);
  }

  function renderGlossary() {
    const el = document.getElementById("glossary");
    el.innerHTML = "";
    const items = [
      ["S(t) 睡眠壓力 (Process S)", "清醒期間持續累積、睡眠期間逐漸清除的「恆定壓力」，白話講就是「累積的睏意」。"],
      ["H+ 上閾值", "睡眠壓力達到此線就會自然想睡（入睡閾值），此線隨晝夜節律上下擺動，晚間最高（不易入睡），凌晨前後最低（易入睡）。"],
      ["H− 下閾值", "睡眠壓力降到此線以下就會自然醒來（起床閾值），同樣隨晝夜節律擺動。"],
      ["清醒努力 (Wake Effort)", "若鬧鐘把你在 S 尚未降到 H− 之前就叫醒，代表身體本來還想睡，醒著需要額外「努力」維持清醒，這段時間專注力與反應會比平常差。"],
      ["社交時差 (Social Jetlag)", "平常因為上班上課等社會作息、被迫起床時間，和你身體真正偏好的起床時間之間的落差，落差越大代表越「時差」。"],
      ["睡眠效率 (SE)", "實際睡著時間 ÷ 躺在床上的總時間；數字越低代表翻來覆去、半夜清醒的比例越高。"],
      ["睡眠負債", "目標睡眠時數與實際睡眠時數的差距，長期累積會讓睡眠壓力基準線持續墊高。"],
      ["真實時型", "根據你「自由選擇偏好起床時間」推算出的生理時鐘傾向，分成早鳥型、中間型、夜貓型。早鳥型代表生理時鐘低點較早，通常較容易早睡早起；夜貓型相反，生理時鐘低點較晚，容易晚睡晚起；中間型介於兩者之間，是最常見的類型，早睡早起或晚睡晚起都還算能適應。這只是傾向分類，不是絕對，僅供參考。"],
      ["主觀嗜睡度 (mini-ESS) 分數怎麼看", "總分 0–12：0–3 分偏低，白天精神狀況多半不錯；4–6 分中等，是最常見的範圍，偶爾會累但大致正常；7–9 分偏高，白天嗜睡感較明顯，可能已經影響專注力；10–12 分最高，建議留意整體睡眠量是否足夠，若持續嗜睡可考慮諮詢睡眠專科。"],
      ["模型自然睡眠週期", "假設完全不受鬧鐘、日夜節律等外部提示干擾，純粹依你的睡眠壓力參數，模型推算出身體會自然形成的睡／醒週期長度。「睡」是自然會睡多久、「醒」是自然會醒多久，兩者相加是「週期」。這個週期不一定剛好等於 24 小時，因為這是理論值、不是你實際的日夜作息，差異大小不代表有問題，只是反映模型參數的特性，可以當作參考指標。"],
    ];
    el.appendChild(buildAccordion(items));
  }

  // ------------------------------------------------------------------
  function drawChart(result, nowClock, nowDate) {
    const canvas = document.getElementById("chart");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const padL = 55, padR = 20, padT = 60, padB = 45;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const tMax = result.points[result.points.length - 1].t - nowClock;
    const tMin = 0, yMin = 0, yMax = 1;
    function xPix(tRel) { return padL + ((tRel - tMin) / (tMax - tMin)) * plotW; }
    function yPix(v) { return padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

    // Exercise-zone background bands (only over awake stretches)
    for (let i = 0; i < result.points.length - 1; i++) {
      const p = result.points[i];
      if (p.asleep) continue;
      const gap = nextOnsetGap(p.t, result.sleepIntervals);
      const zone = classifyZone(gap);
      ctx.fillStyle = zone === "green" ? "rgba(31,138,76,0.10)" : zone === "yellow" ? "rgba(184,134,11,0.14)" : "rgba(192,57,43,0.16)";
      const x0 = xPix(p.t - nowClock), x1 = xPix(result.points[i + 1].t - nowClock);
      ctx.fillRect(x0, padT, Math.max(x1 - x0, 1), plotH);
    }

    // Sleep shading
    ctx.fillStyle = "rgba(90,90,100,0.28)";
    for (const [onset, offset] of result.sleepIntervals) {
      const x0 = xPix(onset - nowClock), x1 = xPix(offset - nowClock);
      ctx.fillRect(x0, padT, x1 - x0, plotH);
    }

    // Axes
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

    ctx.fillStyle = "#333"; ctx.font = "12px sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = 0; v <= 1.001; v += 0.2) {
      const y = yPix(v);
      ctx.fillText(v.toFixed(1), padL - 8, y);
      ctx.strokeStyle = "#eee"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    // Day-boundary markers (light vertical line + date label) so repeated
    // clock times across the 48h span (e.g. two 15:00's) aren't ambiguous.
    if (nowDate) {
      const firstBoundary = (24 - (nowClock % 24)) % 24 || 24;
      for (let t = firstBoundary; t <= tMax + 0.001; t += 24) {
        const x = xPix(t);
        ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
        ctx.setLineDash([]);
        const dAt = new Date(nowDate.getTime() + t * 3600 * 1000);
        const dateLabel = (dAt.getMonth() + 1) + "/" + dAt.getDate();
        ctx.fillStyle = "#999"; ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(dateLabel, x, padT - 4);
      }
    }

    // X-axis ticks: actual clock time (HH:MM), not "hours from now" -- easier
    // to read at a glance without mental math.
    ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let t = 0; t <= tMax + 0.001; t += 6) {
      const x = xPix(t);
      const label = fmtClock(nowClock + t);
      ctx.fillStyle = "#333"; ctx.fillText(label, x, padT + plotH + 8);
    }
    ctx.fillText("實際時間（每 6 小時標示，虛線為換日）", padL + plotW / 2, padT + plotH + 26);

    ctx.save(); ctx.translate(14, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.fillText("非因次化睡眠壓力 (0-1)", 0, 0); ctx.restore();

    ctx.textAlign = "center"; ctx.font = "14px sans-serif";
    ctx.fillText("雙歷程模型：未來 48 小時睡眠壓力與運動時機模擬", padL + plotW / 2, 16);
    ctx.font = "11px sans-serif"; ctx.fillStyle = "#666";
    ctx.fillText("(Borbély & Daan 1984; Skeldon & Dijk 2025; 運動時機色帶依 Leota et al. 2025 / Stutz et al. 2019)", padL + plotW / 2, 34);

    function drawLine(key, color, dashed) {
      ctx.strokeStyle = color; ctx.lineWidth = dashed ? 1.4 : 2.2; ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      result.points.forEach((p, i) => {
        const x = xPix(p.t - nowClock), y = yPix(p[key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.setLineDash([]);
    }
    drawLine("hPlus", "#b5342c", true);
    drawLine("hMinus", "#2c6db5", true);
    drawLine("s", "#111111", false);

    const legendItems = [
      { color: "#111111", label: "S(t) 睡眠壓力", dashed: false },
      { color: "#b5342c", label: "H+ 上閾值（入睡）", dashed: true },
      { color: "#2c6db5", label: "H− 下閾值（起床）", dashed: true },
    ];
    let ly = padT + 12; const lx = padL + plotW - 175;
    ctx.font = "12px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    legendItems.forEach((item) => {
      ctx.strokeStyle = item.color; ctx.lineWidth = item.dashed ? 1.4 : 2.2; ctx.setLineDash(item.dashed ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 24, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#333"; ctx.fillText(item.label, lx + 30, ly); ly += 18;
    });
  }

  // ------------------------------------------------------------------
  function fillDemoValues() {
    document.getElementById("age").value = "45";
    document.getElementById("desiredSleep").value = "8";
    document.getElementById("habitualWake").value = "06:30";
    document.getElementById("preferredWake").value = "08:00";
    document.getElementById("actualWakeToday").value = "06:30";
    document.getElementById("actualSleepHours").value = "5.5";
    document.getElementById("ess1").value = "2";
    document.getElementById("ess2").value = "2";
    document.getElementById("ess3").value = "1";
    document.getElementById("ess4").value = "2";
    document.getElementById("sleepLatency").value = "35";
    document.getElementById("awakenings").value = "2";
    document.getElementById("exerciseType").value = "aerobic";
  }

  window.addEventListener("DOMContentLoaded", function () {
    document.getElementById("analyzeBtn").addEventListener("click", analyze);
    document.getElementById("demoBtn").addEventListener("click", function () { fillDemoValues(); analyze(); });
  });
})();