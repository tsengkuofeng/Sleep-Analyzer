/*
 * model.js
 *
 * Core implementation of Borbely's Two-Process Model (2PM) of sleep
 * regulation, ported from the original Python reference implementation
 * (two_process_model.py) to plain JavaScript so it can run entirely in
 * the browser (or later be dropped into a React Native / React Native
 * Web project) with no build step and no server.
 *
 * The model combines two processes:
 *
 *   Process S - homeostatic sleep pressure. It rises exponentially
 *               during wake and decays exponentially during sleep.
 *   Process C - the circadian process. A sinusoidal oscillator that
 *               modulates the upper ("sleep onset") and lower
 *               ("sleep offset") thresholds at which Process S switches
 *               between rising and falling.
 *
 * Sleep onset is predicted to occur when S(t) reaches the upper
 * threshold H+(t); sleep offset (waking) is predicted to occur when
 * S(t) falls to the lower threshold H-(t).
 *
 * Equations and the standard non-dimensional parameter values used as
 * defaults here are taken directly from:
 *
 *   [1] Borbely AA. A two process model of sleep regulation.
 *       Hum Neurobiol. 1982;1(3):195-204.
 *   [2] Borbely AA. The two-process model of sleep regulation:
 *       beginnings and outlook. J Sleep Res. 2022;31(4):e13598.
 *   [3] Skeldon AC, Dijk DJ. The complexity and commonness of the
 *       two-process model of sleep regulation from a mathematical
 *       perspective. npj Biol Timing Sleep. 2025;2:24.
 *       doi:10.1038/s44323-025-00039-z
 *       (Methods section, equations (4)-(22); standard parameters
 *       reported in the Fig. 1 caption: chiS = 4.2 h, chiW = 18.2 h,
 *       H0+ = 0.67, H0- = 0.17, a = 0.12, mu = 1.)
 *
 * This module only implements the mathematics of the original
 * two-process model (Processes S and C and the fixed threshold-crossing
 * rule). It does NOT implement the light-entrainment / HCL extension
 * also discussed in [3]; nor does it model exercise physiology, which
 * is not part of the two-process model at all (see the
 * findBestExerciseWindow() note in app.js for how that heuristic is
 * derived and how it is clearly separated from the peer-reviewed model
 * itself).
 *
 * Exposed as the global `TwoProcessModel` object (no module bundler
 * required, so it works when opened directly as a static file / via
 * GitHub Pages).
 */

(function (global) {
  "use strict";

  /**
   * Standard (non-dimensional) two-process model parameters.
   * Defaults reproduce Fig. 1b of Skeldon & Dijk (2025) [3], which in
   * turn reproduces the parameterisation introduced by Daan, Beersma &
   * Borbely (1984) building on Borbely (1982) [1].
   */
  function defaultParams() {
    return {
      chiS: 4.2,        // h, homeostatic time constant during sleep
      chiW: 18.2,       // h, homeostatic time constant during wake
      mu: 1.0,          // upper asymptote (non-dimensional)
      hPlus0: 0.67,     // mean level of the upper ("sleep-onset") threshold
      hMinus0: 0.17,    // mean level of the lower ("sleep-offset") threshold
      amplitude: 0.12,  // circadian amplitude, a
      period: 24.0,     // h, circadian period T_c (assumed entrained to 24 h)
      circadianMinTime: 4.5,
      // ^ clock time (24 h, e.g. 4.5 = 04:30) of the circadian minimum.
      // The paper notes this is commonly assigned ~06:00 in young adults
      // but varies between individuals [3]; here it is a user-adjustable
      // input rather than a fixed model parameter.
    };
  }

  /**
   * Process C: circadian modulation of the thresholds, C(t).
   * Defined so that C(t) = -1 exactly at `circadianMinTime` (and every
   * `period` hours thereafter), matching the convention in [3] that the
   * circadian minimum is a reference phase. C(t) = +1 exactly 12 h later.
   */
  function circadianC(t, p) {
    const omega = (2.0 * Math.PI) / p.period;
    return -Math.cos(omega * (t - p.circadianMinTime));
  }

  /** H+(t) = H0+ + a * C(t) -- eq. (7)/(15) in [3]. */
  function upperThreshold(t, p) {
    return p.hPlus0 + p.amplitude * circadianC(t, p);
  }

  /** H-(t) = H0- + a * C(t) -- eq. (8)/(16) in [3]. */
  function lowerThreshold(t, p) {
    return p.hMinus0 + p.amplitude * circadianC(t, p);
  }

  /**
   * Homeostatic sleep pressure while awake -- eq. (13) in [3].
   * H(t) = mu + (H(tOff) - mu) * exp(-(t - tOff) / chiW)
   */
  function sDuringWake(t, tOff, hOff, p) {
    return p.mu + (hOff - p.mu) * Math.exp(-(t - tOff) / p.chiW);
  }

  /**
   * Homeostatic sleep pressure while asleep -- eq. (14) in [3].
   * H(t) = H(tOn) * exp(-(t - tOn) / chiS)
   */
  function sDuringSleep(t, tOn, hOn, p) {
    return hOn * Math.exp(-(t - tOn) / p.chiS);
  }

  /**
   * Forward-simulate the two-process model by threshold crossing.
   *
   * `t0` is the absolute clock time (hours since midnight, may exceed 24
   * to represent later days) at which the simulation starts. It matters
   * because the circadian thresholds H+(t)/H-(t) are defined relative to
   * `p.circadianMinTime`, which is itself an absolute clock time -- so
   * simulating "6 hours from now" must know what time "now" actually is
   * in order to line up correctly with the circadian cycle. All times in
   * the returned result (including sleepIntervals) are on this same
   * absolute clock-time scale, so a value like 25.5 means 01:30 the
   * following day.
   *
   * This is a straightforward small-step numerical rollout (not an
   * analytic circle map); dt=0.02 h (1.2 min) is small enough for the
   * time constants used here (chi ~ 4-18 h).
   *
   * @returns {{points: Array<{t:number,s:number,hPlus:number,hMinus:number,asleep:boolean}>, sleepIntervals: Array<[number, number]>}}
   */
  function simulate(p, startS, startAsleep, durationH, dt, t0) {
    durationH = durationH === undefined ? 48.0 : durationH;
    dt = dt === undefined ? 0.02 : dt;
    t0 = t0 === undefined ? 0.0 : t0;

    const points = [];
    const sleepIntervals = [];

    let t = t0;
    let asleep = startAsleep;
    let s = startS;
    let segmentStartT = t0;
    let segmentStartS = startS;
    let currentOnset = asleep ? t0 : null;

    const nSteps = Math.floor(durationH / dt);
    for (let i = 0; i <= nSteps; i++) {
      const hPlus = upperThreshold(t, p);
      const hMinus = lowerThreshold(t, p);

      if (asleep) {
        s = sDuringSleep(t, segmentStartT, segmentStartS, p);
      } else {
        s = sDuringWake(t, segmentStartT, segmentStartS, p);
      }

      points.push({ t: t, s: s, hPlus: hPlus, hMinus: hMinus, asleep: asleep });

      if (asleep && s <= hMinus) {
        sleepIntervals.push([currentOnset, t]);
        asleep = false;
        segmentStartT = t;
        segmentStartS = s;
        currentOnset = null;
      } else if (!asleep && s >= hPlus) {
        asleep = true;
        segmentStartT = t;
        segmentStartS = s;
        currentOnset = t;
      }

      t += dt;
    }

    if (currentOnset !== null) {
      sleepIntervals.push([currentOnset, t]);
    }

    return { points: points, sleepIntervals: sleepIntervals };
  }

  /**
   * Analytic natural period of the sleep-wake oscillator (a = 0).
   * Implements eqs. (1)-(3) / (19),(22) in [3]:
   *   T_sleep = chiS * ln(H0+ / H0-)
   *   T_wake  = chiW * ln((mu - H0-) / (mu - H0+))
   *   T_nat   = T_sleep + T_wake
   * @returns {[number, number, number]} [tSleep, tWake, tNat] in hours.
   */
  function naturalPeriod(p) {
    const tSleep = p.chiS * Math.log(p.hPlus0 / p.hMinus0);
    const tWake = p.chiW * Math.log((p.mu - p.hMinus0) / (p.mu - p.hPlus0));
    return [tSleep, tWake, tSleep + tWake];
  }

  global.TwoProcessModel = {
    defaultParams: defaultParams,
    circadianC: circadianC,
    upperThreshold: upperThreshold,
    lowerThreshold: lowerThreshold,
    sDuringWake: sDuringWake,
    sDuringSleep: sDuringSleep,
    simulate: simulate,
    naturalPeriod: naturalPeriod,
  };
})(window);
