import { decodeBlob, trimSilence } from "./score";

const MODEL_ID = "Xenova/wav2vec2-base-960h";
const FRAME_SAMPLES = 320; // the model outputs one frame per 20 ms (320 samples at 16 kHz)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loaded = { processor: any; model: any };
let loading: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  if (!loading) {
    loading = (async () => {
      const { AutoProcessor, AutoModel } = await import("@huggingface/transformers");
      const processor = await AutoProcessor.from_pretrained(MODEL_ID);
      const model = await AutoModel.from_pretrained(MODEL_ID, { dtype: "q8" });
      return { processor, model } as Loaded;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

async function embed(blob: Blob) {
  const samples = trimSilence(await decodeBlob(blob));
  const { processor, model } = await load();
  const inputs = await processor(samples);
  const output = await model(inputs);

  const key =
    ["last_hidden_state", "logits"].find((k) => output[k]) ?? Object.keys(output)[0];
  const tensor = output[key];
  const dims: number[] = tensor.dims;
  const T = dims[dims.length - 2];
  const D = dims[dims.length - 1];
  const data = tensor.data as Float32Array;

  const raw: Float32Array[] = [];
  for (let t = 0; t < T; t++) raw.push(data.slice(t * D, (t + 1) * D));

  // how loud each model frame is, to find the parts with actual voice
  const energy: number[] = [];
  for (let t = 0; t < T; t++) {
    const start = t * FRAME_SAMPLES;
    const end = Math.min(samples.length, start + FRAME_SAMPLES);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    energy.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  const peak = Math.max(...energy);
  const voiced = energy.map((e) => e > peak * 0.1);

  return { raw, voiced, key, dims };
}

// subtract the recording's average, which removes constant voice/mic offsets
function center(frames: Float32Array[]) {
  const D = frames[0].length;
  const mean = new Float32Array(D);
  for (const f of frames) for (let d = 0; d < D; d++) mean[d] += f[d] / frames.length;
  return frames.map((f) => f.map((v, d) => v - mean[d]));
}

function softmax(v: Float32Array) {
  let max = -Infinity;
  for (const x of v) if (x > max) max = x;
  const e = Array.from(v, (x) => Math.exp(x - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return Float32Array.from(e, (x) => x / sum);
}

// turn scores into probabilities, then average each frame with its neighbors
function smoothProbs(frames: Float32Array[], radius = 2) {
  const probs = frames.map(softmax);
  const D = probs[0].length;
  return probs.map((_, t) => {
    const out = new Float32Array(D);
    let n = 0;
    for (let k = Math.max(0, t - radius); k <= Math.min(probs.length - 1, t + radius); k++) {
      for (let d = 0; d < D; d++) out[d] += probs[k][d];
      n++;
    }
    for (let d = 0; d < D; d++) out[d] = Math.sqrt(out[d] / n);
    return out;
  });
}

function cosineDistance(a: Float32Array, b: Float32Array) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(na * nb) || 1);
}

function dtw(a: Float32Array[], b: Float32Array[]) {
  const n = a.length;
  const m = b.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  cost[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = cosineDistance(a[i - 1], b[j - 1]);
      cost[i][j] = d + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1]);
    }
  }
  return cost[n][m] / (n + m);
}

export async function compareWithModel(original: Blob, attempt: Blob) {
  // one at a time: the model can't run two recordings at once
  const a = await embed(original);
  const b = await embed(attempt);

  // 1. current method
  const distance = dtw(center(a.raw), center(b.raw));

  // 2. only the frames with voice (silence removed)
  const av = a.raw.filter((_, t) => a.voiced[t]);
  const bv = b.raw.filter((_, t) => b.voiced[t]);
  const voicedDistance =
    av.length >= 5 && bv.length >= 5 ? dtw(center(av), center(bv)) : distance;

  // 3. smoothed probabilities
  const smoothDistance =
    a.key === "logits" ? dtw(center(smoothProbs(a.raw)), center(smoothProbs(b.raw))) : distance;

  return { distance, voicedDistance, smoothDistance, key: a.key, dims: a.dims };
}

// Tuning knobs for the model's distance. Provisional: we'll retune as real friends play.
const GOOD_DISTANCE = 0.09; // this close or closer = 100
const BAD_DISTANCE = 0.3; // this far or farther = 0

// Start downloading the model in the background
export function preloadModel() {
  load().catch(() => {});
}

export async function scoreWithModel(original: Blob, attempt: Blob) {
  const { smoothDistance } = await compareWithModel(original, attempt);
  const raw = ((BAD_DISTANCE - smoothDistance) / (BAD_DISTANCE - GOOD_DISTANCE)) * 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, distance: smoothDistance };
}