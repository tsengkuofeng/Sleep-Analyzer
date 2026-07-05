/*
 * model.js
 * Two-process model of sleep regulation (Borbély & Daan 1984; Skeldon & Dijk,
 * npj Biol Timing Sleep 2025) core math, plus documented extensions for:
 *   - chronotype / social-jetlag phase setting
 *   - sleep-efficiency-adjusted clearance rate
 *   - ESS-adjusted wake-pressure gain
 *   - age-adjusted circadian amplitude
 *   - "wake effort" (forced early waking) detection
 *
 * Anything NOT taken directly from the cited papers is explicitly labelled
 * DESIGN CHOICE in a comment, so you can tell model fact from engineering
 * heuristic at a glance.
 *
 * Standard parameter set source: Skeldon AC, Dijk DJ. npj Biol Timing Sleep
 * 2025;2:24. (illustrative parameter set reproducing Borbély 1982 / Daan,
 * Beersma & Borbély 1984): chi_s=4.2h, chi_w=18.2h, H+0=0.67, H-0=0.17,
 * a=0.12, mu=1.
 */

(function (root) {
  "use strict";

  function defaultParams() {
    return {
      chiS: 4.2, // homeostatic time constant, sleep (h)
      chiW: 18.2, // homeostatic time constant, wake (h)
      hPlus0: 0.67, // mean upper (sleep-onset) threshold
      hMinus0: 0.17, // mean lower (wake) threshold
      a: 0.12, // circadian amplitude (baseline, young adult)
      mu: 1.0, // upper asymptote of S during wake
      circadianMinTime: 5.0, // clock hour of circadian minimum (approx. core body temp nadir)
      ageAmplitudeFactor: 1.0, // multiplies `a`; set via ageAmplitudeFactor()
      wakeGainMultiplier: 1.0, // multiplies wake-phase S growth; set via essGainMultiplier()
      sleepClearanceDivisor: 1.0, // divides sleep-phase decay rate (>1 = slower clearance)
    };
  }

  // DESIGN CHOICE: circadian amplitude declines with age. The direction is
  // well documented in chronobiology (reduced circadian amplitude and more
  // fragmented sleep in older adults), but this specific linear formula is
  // an engineering approximation for this app, NOT a coefficient taken from
  // Skeldon & Dijk (2025) or Borbély & Daan (1984).
  function ageAmplitudeFactor(age) {
    if (!isFinite(age) || age <= 25) return 1.0;
    const factor = 1.0 - 0.006 * (age - 25);
    return Math.max(0.55, Math.min(1.05, factor));
  }

  // DESIGN CHOICE: higher subjective daytime sleepiness (mini-ESS) nudges up
  // the rate at which S accumulates during wake, as a stand-in for reduced
  // individual tolerance to sleep pressure. Not a value from the cited papers.
  function essGainMultiplier(essScore, essMax) {
    const mid = essMax / 2;
    const delta = (essScore - mid) / essMax; // -0.5..0.5
    return Math.max(0.85, Math.min(1.25, 1.0 + delta * 0.5));
  }

  // DESIGN CHOICE: lower sleep efficiency (SE) slows the clearance of S
  // during sleep (fragmented/inefficient sleep dissipates less pressure per
  // hour in bed). Divisor grows as SE falls below 1.
  function sleepClearanceDivisor(se) {
    const seClamped = Math.max(0.4, Math.min(1.0, se));
    return 1.0 / seClamped; // SE=1 -> 1.0 (no penalty); SE=0.6 -> 1.67x slower
  }

  // ---- Circadian thresholds ----------------------------------------------
  // Both thresholds oscillate in phase: minimum near the circadian minimum
  // (core-body-temperature nadir -> easiest to wake / hardest to stay
  // asleep), maximum ~12h later (the evening "wake maintenance zone").
  function circadianModulation(t, params) {
    const a = params.a * params.ageAmplitudeFactor;
    const phasePeak = params.circadianMinTime + 12;
    return a * Math.cos((2 * Math.PI * (t - phasePeak)) / 24);
  }
  function upperThreshold(t, params) { return params.hPlus0 + circadianModulation(t, params); }
  function lowerThreshold(t, params) { return params.hMinus0 + circadianModulation(t, params); }

  // ---- Homeostatic process S ---------------------------------------------
  function sDuringWake(dt, tStart, sStart, params) {
    const chiWeff = params.chiW / params.wakeGainMultiplier;
    return params.mu - (params.mu - sStart) * Math.exp(-dt / chiWeff);
  }
  function sDuringSleep(dt, tStart, sStart, params) {
    const chiSeff = params.chiS * params.sleepClearanceDivisor;
    return sStart * Math.exp(-dt / chiSeff);
  }

  // ---- Simulation ---------------------------------------------------------
  // Steps forward from `tStart` for `hours`, starting in state `asleepStart`
  // with pressure `sStart`. Returns per-step points plus detected sleep
  // intervals [onset, offset] (absolute clock-hour scale, may exceed 24).
  function simulate(params, sStart, asleepStart, hours, dt, tStart) {
    const points = [];
    let t = tStart, s = sStart, asleep = asleepStart, segStart = t;
    const sleepIntervals = [];
    const nSteps = Math.round(hours / dt);
    for (let i = 0; i <= nSteps; i++) {
      const hPlus = upperThreshold(t, params);
      const hMinus = lowerThreshold(t, params);
      points.push({ t, s, hPlus, hMinus, asleep });
      if (i === nSteps) break;
      const sNext = asleep ? sDuringSleep(dt, t, s, params) : sDuringWake(dt, t, s, params);
      const tNext = t + dt;
      const hPlusNext = upperThreshold(tNext, params);
      const hMinusNext = lowerThreshold(tNext, params);
      if (!asleep && sNext >= hPlusNext) { asleep = true; segStart = tNext; }
      else if (asleep && sNext <= hMinusNext) { asleep = false; sleepIntervals.push([segStart, tNext]); }
      s = sNext; t = tNext;
    }
    if (asleep) sleepIntervals.push([segStart, t]);
    return { points, sleepIntervals };
  }

  // Natural (unforced) sleep/wake period lengths given zero circadian
  // amplitude, per Skeldon & Dijk eq. for T_sleep, T_wake, T_nat.
  function naturalPeriod(params) {
    const tSleep = params.chiS * Math.log(params.hPlus0 / params.hMinus0);
    const tWake = params.chiW * Math.log((params.mu - params.hMinus0) / (params.mu - params.hPlus0));
    return [tSleep, tWake, tSleep + tWake];
  }

  root.TwoProcessModel = {
    defaultParams, ageAmplitudeFactor, essGainMultiplier, sleepClearanceDivisor,
    circadianModulation, upperThreshold, lowerThreshold, sDuringWake, sDuringSleep,
    simulate, naturalPeriod,
  };
})(window);