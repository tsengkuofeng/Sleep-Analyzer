/*
 * app.js
 *
 * UI logic for the browser-based sleep analyzer. Reads the form inputs,
 * runs the two-process model (model.js), renders a text report, and
 * draws a 48-hour sleep-pressure chart on a <canvas>.
 *
 * IMPORTANT NOTE ON THE EXERCISE-TIMING FEATURE:
 * None of the cited papers (see model.js header) discuss exercise. The
 * "best time to exercise" suggestion here is a heuristic extension: it
 * picks the time of day, during the predicted wake episode, when the
 * model's own "distance to the sleep-onset threshold" (H+(t) - S(t)) is
 * largest -- i.e. when the model predicts you are furthest from feeling
 * sleepy. This is a reasonable, model-consistent proxy for daytime
 * alertness, but it is NOT a validated exercise-science result and
 * should be treated as a rough suggestion, not medical advice.
 */

(function () {
  "use strict";

  const M = window.TwoProcessModel;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** Parse an <input type="time"> value ("HH:MM") into decimal hours. */
  function parseTimeInput(value, fallback) {
    if (!value) return fallback;
    const parts = value.split(":");
    if (parts.length < 2) return fallback;
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    if (isNaN(h) || isNaN(m)) return fallback;
    return ((h + m / 60.0) % 24 + 24) % 24;
  }

  /** Format decimal hours as HH:MM, wrapping into [0, 24). */
  function fmtClock(hours) {
    let h24 = ((hours % 24) + 24) % 24;
    let h = Math.floor(h24);
    let m = Math.round((h24 - h) * 60);
    if (m === 60) {
      m = 0;
      h = (h + 1) % 24;
    }
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function readFloat(id, fallback) {
    const el = document.getElementById(id);
    const v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  }

  // ------------------------------------------------------------------
  // Analysis helpers (mirrors sleep_analyzer.py)
  // ------------------------------------------------------------------

  /**
   * Rough estimate of circadian-minimum clock time.
   * The papers note the circadian (core-body-temperature) minimum is
   * often assigned ~06:00 in young adults on a "typical" schedule, but
   * varies between individuals and is generally a couple of hours before
   * habitual wake time. We use "habitual wake time minus 2 h" as a
   * simple, clearly-documented approximation -- this offset is NOT a
   * value taken from the cited papers; it is a common rule-of-thumb used
   * here for convenience.
   */
  function estimateCircadianMinTime(habitualWake) {
    return ((habitualWake - 2.0) % 24 + 24) % 24;
  }

  function classifyChronotype(circMin) {
    if (circMin <= 4.0 || circMin >= 22.0) {
      return "偏向「早鳥型」(morning type)：生理時鐘低點較早";
    }
    if (circMin > 4.0 && circMin <= 5.5) {
      return "中間型 (intermediate)，稍偏早鳥";
    }
    if (circMin > 5.5 && circMin <= 7.0) {
      return "中間型 (intermediate)";
    }
    return "偏向「夜貓型」(evening type)：生理時鐘低點較晚";
  }

  /** 0-100 index of how close S(t) is to the upper (sleep-onset) threshold. */
  function sleepinessIndex(s, hMinus, hPlus) {
    if (hPlus <= hMinus) return 0;
    const pct = ((s - hMinus) / (hPlus - hMinus)) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  /**
   * Heuristic: time (within [wakeStartT+1, bedtimeT-3]) that maximises
   * the model's buffer to the sleep-onset threshold, H+(t) - S(t).
   * See the IMPORTANT NOTE at the top of this file.
   */
  function findBestExerciseWindow(points, wakeStartT, bedtimeT) {
    const lo = wakeStartT + 1.0;
    const hi = bedtimeT - 3.0;
    if (hi <= lo) return null;
    let bestT = null;
    let bestGap = -Infinity;
    for (const p of points) {
      if (p.t >= lo && p.t <= hi && !p.asleep) {
        const gap = p.hPlus - p.s;
        if (gap > bestGap) {
          bestGap = gap;
          bestT = p.t;
        }
      }
    }
    return bestT;
  }

  // ------------------------------------------------------------------
  // Main analysis + rendering
  // ------------------------------------------------------------------

  function analyze() {
    const habitualWake = parseTimeInput(document.getElementById("habitualWake").value, 7.0);
    const hoursAwakeNow = readFloat("hoursAwakeNow", 6.0);
    const recentAvgSleep = readFloat("recentAvgSleep", 6.5);
    const desiredSleep = readFloat("desiredSleep", 8.0);
    const wantExercise = document.getElementById("wantExercise").checked;

    const params = M.defaultParams();
    const circadianMin = estimateCircadianMinTime(habitualWake);
    params.circadianMinTime = circadianMin;

    // Assume the user's homeostatic pressure equalled the lower threshold
    // at their last natural wake-up (S(wake) = H0-, per the model's own
    // switching rule), then integrate the wake equation forward for
    // `hoursAwakeNow` hours to estimate current pressure.
    const sAtWake = params.hMinus0;
    const sNow = M.sDuringWake(hoursAwakeNow, 0.0, sAtWake, params);

    // "Now", on the same absolute clock-time scale as circadianMinTime.
    const nowClock = habitualWake + hoursAwakeNow;

    const result = M.simulate(params, sNow, false, 48.0, 0.02, nowClock);

    const reportEl = document.getElementById("report");
    reportEl.innerHTML = "";

    if (!result.sleepIntervals.length) {
      reportEl.textContent = "模型在 48 小時內沒有預測到入睡時間，請檢查輸入的參數是否合理。";
      return;
    }

    const [firstOnset, firstOffset] = result.sleepIntervals[0];
    const predictedBedtime = fmtClock(firstOnset);
    const predictedWake = fmtClock(firstOffset);
    const predictedDuration = firstOffset - firstOnset;

    const hPlusNow = M.upperThreshold(nowClock, params);
    const hMinusNow = M.lowerThreshold(nowClock, params);
    const idx = sleepinessIndex(sNow, hMinusNow, hPlusNow);

    const sleepDebt = Math.max(0, desiredSleep - recentAvgSleep);
    const [tSleep, tWake, tNat] = M.naturalPeriod(params);

    const lines = [];
    lines.push(["目前時間（依你輸入推算）", "約 " + fmtClock(nowClock)]);
    lines.push(["目前睡意指數", idx.toFixed(0) + " / 100（0=剛睡飽，100=已達模型入睡閾值）"]);
    lines.push(["預測自然入睡時間", "約 " + predictedBedtime]);
    lines.push(["預測自然起床時間", "約 " + predictedWake]);
    lines.push(["預測自然睡眠長度", "約 " + predictedDuration.toFixed(1) + " 小時"]);
    lines.push(["粗估生理時鐘低點", "約 " + fmtClock(circadianMin) + "（近似值，見下方說明）"]);
    lines.push(["粗略時型判斷", classifyChronotype(circadianMin)]);
    lines.push(["目前睡眠負債", "約 " + sleepDebt.toFixed(1) + " 小時/天（相對於目標睡眠時數）"]);
    lines.push([
      "模型的自然睡眠週期",
      "睡 " + tSleep.toFixed(1) + " h + 醒 " + tWake.toFixed(1) + " h = 週期 " + tNat.toFixed(1) + " h" +
        "（來源：Borbely 1982 / Skeldon & Dijk 2025 標準參數）",
    ]);

    const dl = document.createElement("dl");
    dl.className = "report-list";
    for (const [k, v] of lines) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    reportEl.appendChild(dl);

    if (wantExercise) {
      const bestT = findBestExerciseWindow(result.points, nowClock, firstOnset);
      const exerciseBox = document.createElement("div");
      exerciseBox.className = "exercise-box";
      if (bestT === null) {
        exerciseBox.textContent = "清醒時間太短，暫時無法給出合適的運動時間建議。";
      } else {
        const strong = document.createElement("strong");
        strong.textContent = "建議運動時機：約 " + fmtClock(bestT);
        const note = document.createElement("p");
        note.className = "disclaimer";
        note.textContent =
          "重要說明：此建議並非來自 Borbely / Skeldon & Dijk 的論文本身，而是在雙歷程模型輸出上額外設計的簡單延伸推論" +
          "（挑選「距離入睡閾值最遠」的時段作為警覺度代理指標），僅供參考，不是醫學或運動科學建議。";
        exerciseBox.appendChild(strong);
        exerciseBox.appendChild(note);
      }
      reportEl.appendChild(exerciseBox);
    }

    const generalTip = document.createElement("p");
    generalTip.className = "disclaimer";
    generalTip.textContent =
      "一般提醒（常見睡眠衛生建議，非本模型直接輸出）：早上接觸自然光有助於穩定生理時鐘；" +
      "避免睡前 3 小時內劇烈運動或攝取咖啡因，可降低入睡延遲的風險。";
    reportEl.appendChild(generalTip);

    drawChart(result, nowClock);
    document.getElementById("resultsSection").hidden = false;
  }

  // ------------------------------------------------------------------
  // Chart (plain Canvas 2D, no external chart library / dependency)
  // ------------------------------------------------------------------

  function drawChart(result, nowClock) {
    const canvas = document.getElementById("chart");
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 55, padR = 20, padT = 50, padB = 45;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const tMax = result.points[result.points.length - 1].t - nowClock;
    const tMin = 0;
    const yMin = 0, yMax = 1;

    function xPix(tRel) {
      return padL + ((tRel - tMin) / (tMax - tMin)) * plotW;
    }
    function yPix(v) {
      return padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    }

    // Shaded sleep intervals
    ctx.fillStyle = "rgba(120,120,120,0.22)";
    for (const [onset, offset] of result.sleepIntervals) {
      const x0 = xPix(onset - nowClock);
      const x1 = xPix(offset - nowClock);
      ctx.fillRect(x0, padT, x1 - x0, plotH);
    }

    // Axes
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // Y ticks
    ctx.fillStyle = "#333";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let v = 0; v <= 1.001; v += 0.2) {
      const y = yPix(v);
      ctx.fillText(v.toFixed(1), padL - 8, y);
      ctx.strokeStyle = "#eee";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // X ticks (every 6 hours)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let t = 0; t <= tMax + 0.001; t += 6) {
      const x = xPix(t);
      ctx.fillStyle = "#333";
      ctx.fillText(t.toFixed(0), x, padT + plotH + 8);
    }
    ctx.textAlign = "center";
    ctx.fillText("距離現在的時間（小時）", padL + plotW / 2, padT + plotH + 26);

    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("非因次化睡眠壓力 (0-1)", 0, 0);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = "14px sans-serif";
    ctx.fillText("雙歷程模型：未來 48 小時睡眠壓力模擬", padL + plotW / 2, 14);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#666";
    ctx.fillText(
      "(Borbely 1982; Daan, Beersma & Borbely 1984; as summarised in Skeldon & Dijk, npj Biol Timing Sleep 2025)",
      padL + plotW / 2,
      32
    );

    // Line-drawing helper
    function drawLine(key, color, dashed) {
      ctx.strokeStyle = color;
      ctx.lineWidth = dashed ? 1.4 : 2.2;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      result.points.forEach((p, i) => {
        const x = xPix(p.t - nowClock);
        const y = yPix(p[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLine("hPlus", "#b5342c", true);
    drawLine("hMinus", "#2c6db5", true);
    drawLine("s", "#111111", false);

    // Legend
    const legendItems = [
      { color: "#111111", label: "S(t) 睡眠壓力", dashed: false },
      { color: "#b5342c", label: "H+ 上閾值（入睡）", dashed: true },
      { color: "#2c6db5", label: "H- 下閾值（起床）", dashed: true },
    ];
    let ly = padT + 12;
    const lx = padL + plotW - 175;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    legendItems.forEach((item) => {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.dashed ? 1.4 : 2.2;
      ctx.setLineDash(item.dashed ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 24, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#333";
      ctx.fillText(item.label, lx + 30, ly);
      ly += 18;
    });
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------

  function fillDemoValues() {
    document.getElementById("habitualWake").value = "07:00";
    document.getElementById("hoursAwakeNow").value = "6";
    document.getElementById("recentAvgSleep").value = "6.5";
    document.getElementById("desiredSleep").value = "8";
    document.getElementById("wantExercise").checked = true;
  }

  window.addEventListener("DOMContentLoaded", function () {
    document.getElementById("analyzeBtn").addEventListener("click", analyze);
    document.getElementById("demoBtn").addEventListener("click", function () {
      fillDemoValues();
      analyze();
    });
  });
})();
