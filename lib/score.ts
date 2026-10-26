const SAMPLE_RATE = 16000;
const FRAME = 400; // 25 ms
const HOP = 160; // 10 ms
const FFT_SIZE = 512;
const NUM_MEL = 26;
const NUM_MFCC = 13;

// Tuning knobs: we'll adjust these after testing with real recordings
const GOOD_DISTANCE = 1.7;
const BAD_DISTANCE = 2.7;

// 1. Turn a recording into raw audio numbers
export async function decodeBlob(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();
  return audioBuffer.getChannelData(0);
}

// 2. Cut the silence off the start and end
export function trimSilence(samples: Float32Array): Float32Array {
  const win = HOP;
  const n = Math.floor(samples.length / win);
  if (n === 0) return samples;

  const rms: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < win; j++) {
      const v = samples[i * win + j];
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / win));
  }

  const threshold = Math.max(...rms) * 0.1;
  let start = rms.findIndex((r) => r > threshold);
  let end = rms.length - 1;
  while (end >= 0 && rms[end] <= threshold) end--;
  if (start === -1 || end < start) return samples;

  const pad = 5; // keep 50 ms around the sound
  start = Math.max(0, start - pad);
  end = Math.min(n - 1, end + pad);
  return samples.slice(start * win, (end + 1) * win);
}

// 3. Fast Fourier Transform (turns a slice of sound into its frequencies)
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlr = Math.cos(ang);
    const wli = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + len / 2] * wr - im[i + j + len / 2] * wi;
        const vi = re[i + j + len / 2] * wi + im[i + j + len / 2] * wr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nwr;
      }
    }
  }
}

// 4. Mel filters: group frequencies the way human hearing does
const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (Math.pow(10, m / 2595) - 1);

function buildMelFilters(): Float64Array[] {
  const lowMel = hzToMel(80);
  const highMel = hzToMel(SAMPLE_RATE / 2);
  const bins: number[] = [];
  for (let i = 0; i < NUM_MEL + 2; i++) {
    const hz = melToHz(lowMel + ((highMel - lowMel) * i) / (NUM_MEL + 1));
    bins.push(Math.floor(((FFT_SIZE + 1) * hz) / SAMPLE_RATE));
  }
  const filters: Float64Array[] = [];
  for (let m = 1; m <= NUM_MEL; m++) {
    const left = bins[m - 1];
    const center = bins[m];
    const right = bins[m + 1];
    const f = new Float64Array(FFT_SIZE / 2 + 1);
    for (let k = left; k < center; k++) f[k] = (k - left) / Math.max(1, center - left);
    for (let k = center; k <= right && k < f.length; k++) f[k] = (right - k) / Math.max(1, right - center);
    filters.push(f);
  }
  return filters;
}

const MEL_FILTERS = buildMelFilters();
const WINDOW = Float64Array.from(
  { length: FRAME },
  (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1))
);

// 5. MFCCs: a short list of numbers per 10 ms describing the sound
export function mfcc(samples: Float32Array): number[][] {
  const emph = new Float32Array(samples.length);
  emph[0] = samples[0];
  for (let i = 1; i < samples.length; i++) emph[i] = samples[i] - 0.97 * samples[i - 1];

  const frames: number[][] = [];
  for (let start = 0; start + FRAME <= emph.length; start += HOP) {
    const re = new Float64Array(FFT_SIZE);
    const im = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FRAME; i++) re[i] = emph[start + i] * WINDOW[i];
    fft(re, im);

    const power = new Float64Array(FFT_SIZE / 2 + 1);
    for (let k = 0; k < power.length; k++) power[k] = (re[k] * re[k] + im[k] * im[k]) / FFT_SIZE;

    const melEnergies = MEL_FILTERS.map((f) => {
      let sum = 0;
      for (let k = 0; k < f.length; k++) sum += f[k] * power[k];
      return Math.log(sum + 1e-10);
    });

    const coeffs: number[] = [];
    for (let c = 1; c <= NUM_MFCC; c++) {
      let sum = 0;
      for (let m = 0; m < NUM_MEL; m++) {
        sum += melEnergies[m] * Math.cos((Math.PI * c * (m + 0.5)) / NUM_MEL);
      }
      coeffs.push(sum);
    }
    frames.push(coeffs);
  }

  // Normalize per recording, which reduces the effect of voice and mic differences
  const dims = NUM_MFCC;
  for (let d = 0; d < dims; d++) {
    let mean = 0;
    for (const f of frames) mean += f[d];
    mean /= frames.length;
    let variance = 0;
    for (const f of frames) variance += (f[d] - mean) ** 2;
    const std = Math.sqrt(variance / frames.length) || 1;
    for (const f of frames) f[d] = (f[d] - mean) / std;
  }
  return frames;
}

// 6. DTW: line up two recordings (even if one is slower) and measure the gap
export function dtwDistance(a: number[][], b: number[][]): number {
  const n = a.length;
  const m = b.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  cost[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let sum = 0;
      for (let d = 0; d < NUM_MFCC; d++) {
        const diff = a[i - 1][d] - b[j - 1][d];
        sum += diff * diff;
      }
      const dist = Math.sqrt(sum);
      cost[i][j] = dist + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1]);
    }
  }
  return cost[n][m] / (n + m);
}

// 7. Put it all together
export async function scoreAttempt(original: Blob, attempt: Blob) {
  const [a, b] = await Promise.all([decodeBlob(original), decodeBlob(attempt)]);
  const featuresA = mfcc(trimSilence(a));
  const featuresB = mfcc(trimSilence(b));
  if (featuresA.length < 5 || featuresB.length < 5) {
    throw new Error("Recording too short");
  }
  const distance = dtwDistance(featuresA, featuresB);
  const raw = ((BAD_DISTANCE - distance) / (BAD_DISTANCE - GOOD_DISTANCE)) * 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, distance };
}