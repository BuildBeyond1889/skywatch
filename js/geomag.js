/* Sky Watch · geomag.js · Earth's magnetic field from the IGRF model (degrees 1–6, epoch 2020 with secular variation).
   Accurate to roughly a degree for declination and inclination: plenty for correcting the compass and drawing field lines.
   Loads before core.js and defines one global: GEOMAG. */
'use strict';
const GEOMAG = (() => {
  // [n, m, g, h, dg/dt, dh/dt] in nT and nT/yr (IGRF-13, 2020.0)
  const C = [
    [1, 0, -29404.8, 0, 5.7, 0], [1, 1, -1450.9, 4652.5, 7.4, -25.9],
    [2, 0, -2499.6, 0, -11.0, 0], [2, 1, 2982.0, -2991.6, -7.0, -30.2], [2, 2, 1677.0, -734.6, -2.1, -22.4],
    [3, 0, 1363.2, 0, 2.2, 0], [3, 1, -2381.2, -82.1, -5.9, 6.0], [3, 2, 1236.2, 241.9, 3.1, -1.1], [3, 3, 525.7, -543.4, -12.0, 0.5],
    [4, 0, 903.0, 0, -1.2, 0], [4, 1, 809.5, 281.9, -1.6, -0.1], [4, 2, 86.3, -158.4, -5.9, 6.5], [4, 3, -309.4, 199.7, 5.2, 3.6], [4, 4, 48.0, -349.7, -5.1, -5.0],
    [5, 0, -234.3, 0, -0.3, 0], [5, 1, 363.2, 47.7, 0.5, 0.0], [5, 2, 187.8, 208.3, -0.6, 2.5], [5, 3, -140.7, -121.2, 0.2, -0.6], [5, 4, -151.2, 32.3, 1.3, 3.0], [5, 5, 13.5, 98.9, 0.9, 0.3],
    [6, 0, 66.0, 0, -0.5, 0], [6, 1, 65.5, -19.1, -0.3, 0.0], [6, 2, 72.9, 25.1, 0.4, -1.6], [6, 3, -121.5, 52.8, 1.3, -1.3], [6, 4, -36.2, -64.5, -1.4, 0.8], [6, 5, 13.5, 8.9, 0.0, 0.0], [6, 6, -64.7, 68.1, 0.9, 1.0]
  ];
  const N = 6, a = 6371.2;
  // Schmidt semi-normalised associated Legendre functions P[n][m](cos θ) and their θ-derivatives.
  function legendre(theta) {
    const x = Math.cos(theta), s = Math.sin(theta);
    const P = [], dP = [];
    for (let n = 0; n <= N; n++) { P.push(new Array(N + 1).fill(0)); dP.push(new Array(N + 1).fill(0)); }
    P[0][0] = 1; dP[0][0] = 0;
    for (let n = 1; n <= N; n++) {
      for (let m = 0; m <= n; m++) {
        if (n === m) {
          const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
          P[n][m] = k * s * P[n - 1][m - 1];
          dP[n][m] = k * (s * dP[n - 1][m - 1] + x * P[n - 1][m - 1]);
        } else {
          const k1 = (2 * n - 1) / Math.sqrt(n * n - m * m);
          const k2 = n - 1 >= m ? Math.sqrt(((n - 1) * (n - 1) - m * m) / (n * n - m * m)) : 0;
          P[n][m] = k1 * x * P[n - 1][m] - (n - 2 >= m ? k2 * P[n - 2][m] : 0);
          dP[n][m] = k1 * (x * dP[n - 1][m] - s * P[n - 1][m]) - (n - 2 >= m ? k2 * dP[n - 2][m] : 0);
        }
      }
    }
    return { P, dP };
  }
  // Field at a place (geodetic latitude ≈ geocentric here; error well under the model's own accuracy).
  function field(latDeg, lonDeg, hKm, date) {
    const yr = (date || new Date()).getUTCFullYear() + (date || new Date()).getUTCMonth() / 12 - 2020;
    const theta = (90 - latDeg) * Math.PI / 180, phi = lonDeg * Math.PI / 180, r = a + (hKm || 0);
    const { P, dP } = legendre(theta);
    let Br = 0, Bt = 0, Bp = 0;
    const st = Math.max(Math.sin(theta), 1e-9);
    for (const [n, m, g0, h0, dg, dh] of C) {
      const gg = g0 + dg * yr, hh = h0 + dh * yr, ar = Math.pow(a / r, n + 2);
      const cm = Math.cos(m * phi), sm = Math.sin(m * phi);
      Br += ar * (n + 1) * (gg * cm + hh * sm) * P[n][m];
      Bt -= ar * (gg * cm + hh * sm) * dP[n][m];
      Bp += ar * m * (gg * sm - hh * cm) * P[n][m] / st;
    }
    const X = -Bt, Y = Bp, Z = -Br; // north, east, down (nT)
    const H = Math.hypot(X, Y), F = Math.hypot(H, Z);
    return { X, Y, Z, H, F, decl: Math.atan2(Y, X) * 180 / Math.PI, incl: Math.atan2(Z, H) * 180 / Math.PI };
  }
  // Geomagnetic (dipole) north pole from the first-degree terms.
  function dipolePole(date) {
    const yr = (date || new Date()).getUTCFullYear() - 2020;
    const g10 = C[0][2] + C[0][4] * yr, g11 = C[1][2] + C[1][4] * yr, h11 = C[1][3] + C[1][5] * yr;
    const B0 = Math.hypot(g10, g11, h11);
    return { lat: 90 - Math.acos(-g10 / B0) * 180 / Math.PI, lon: Math.atan2(-h11, -g11) * 180 / Math.PI };
  }
  return { field, dipolePole };
})();
