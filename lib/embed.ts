import { decodeBlob, trimSilence } from "./score";

const MODEL_ID = "Xenova/wav2vec2-base-960h";

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

    const frames: Float32Array[] = [];
    for (let t = 0; t < T; t++) frames.push(data.slice(t * D, (t + 1) * D));

    // subtract the recording's average, which removes constant voice/mic offsets
    const mean = new Float32Array(D);
    for (const f of frames) for (let d = 0; d < D; d++) mean[d] += f[d] / T;
    for (const f of frames) for (let d = 0; d < D; d++) f[d] -= mean[d];

    return { frames, key, dims };
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
    return { distance: dtw(a.frames, b.frames), key: a.key, dims: a.dims };
}

// Tuning knobs for the model's distance. Provisional: we'll retune as real friends play.
const GOOD_DISTANCE = 0.27; // this close or closer = 100
const BAD_DISTANCE = 0.45; // this far or farther = 0

// Start downloading the model in the background
export function preloadModel() {
    load().catch(() => { });
}

export async function scoreWithModel(original: Blob, attempt: Blob) {
    const { distance } = await compareWithModel(original, attempt);
    const raw = ((BAD_DISTANCE - distance) / (BAD_DISTANCE - GOOD_DISTANCE)) * 100;
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    return { score, distance };
}