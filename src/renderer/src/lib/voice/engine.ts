// The PC's offline speech engine (runs in the hidden Bauer window).
//  • Wake word: Vosk with a tiny grammar listens for "Hey Bauer" all the time (cheap).
//  • Briefing: after the wake word (or the Brief button) we record until you pause,
//    then Whisper (base.en, via ONNX in WebAssembly) writes down what you said.
// Models are downloaded once by the main process and served from app://studyhall/voice-models/.

import type { KaldiRecognizer, Model } from "vosk-browser";
import { api } from "@/lib/data";
import { isSpeaking, stopSpeaking } from "./speak";
// ONNX Runtime's WebAssembly ships inside the app (Vite copies these next to the bundle).
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

const MODELS = `${location.origin}/voice-models/`;
const RATE = 16000;
const FRAME = 2048; // samples per audio callback (128 ms)

export type EngineEvent =
  | { type: "wake" }
  | { type: "level"; value: number } // 0..1 microphone level while recording
  | { type: "heard" } // speech started
  | { type: "recorded" } // speech ended, transcribing
  | { type: "transcript"; text: string; pc?: string } // pc: what the PC was playing (Ctrl+Alt+Shift), written down
  | { type: "nothing" } // listened, but nobody spoke
  | { type: "error"; message: string };

type Listener = (e: EngineEvent) => void;

/** Audio-thread tap: hands over FRAME samples at a time. */
const TAP = `class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${FRAME}); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(${FRAME}); this.n = 0 }
    }
    return true
  }
}
registerProcessor('studyhall-tap', Tap)`;

// Wake phrases. "Bauer" sounds like "bower"; "power" is a near miss, accepted only when sensitive.
const STRONG = /\b(?:hey|hi|okay|ok) (?:bauer|bower)\b/;
const LOOSE = /\b(?:hey|hi|okay|ok) (?:power|bauer|bower|our)\b|\bbauer\b/;
const GRAMMAR = JSON.stringify([
  "hey bauer",
  "hi bauer",
  "okay bauer",
  "hey bower",
  "hey power",
  "bauer",
  "hey",
  "hi",
  "okay",
  "power",
  "hour",
  "our",
  "flower",
  "tower",
  "shower",
  "how are",
  "hello",
  "[unk]",
]);

class Engine {
  private listeners = new Set<Listener>();
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private model: Model | null = null;
  private kws: KaldiRecognizer | null = null;
  private asr:
    | ((
        audio: Float32Array,
        opts: Record<string, unknown>,
      ) => Promise<{ text: string } | { text: string }[]>)
    | null = null;
  private asrLoading: Promise<void> | null = null;

  wake = false;
  /** Nova's new ears are installed: the wake word and writing-down run in the main process (Parakeet). */
  ears = false;
  /** Recording while the talk key (Ctrl + Alt) is held: it ends when you let go, not when you pause. */
  private ptt = false;
  /** True while the panel is busy with a briefing (the wake word is ignored then). */
  held = false;
  sensitivity = 50;
  private mode: "idle" | "wake" | "record" | "busy" = "idle";
  private preroll: Float32Array[] = [];
  private rec: Float32Array[] = [];
  private noise = 0.004; // running estimate of background level (RMS)
  private spoke = false;
  private silentFrames = 0;
  private recFrames = 0;
  private lastWake = 0;
  private lastPartial = "";
  lastAudio: Float32Array | null = null; // (troubleshooting)
  /** Ctrl+Alt+Shift: the PC's own sound (Windows loopback), recorded beside the microphone while the keys are held. */
  private pc: {
    stream: MediaStream;
    ctx: AudioContext;
    node: AudioWorkletNode;
  } | null = null;
  private pcRec: Float32Array[] | null = null;

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  /** Recent happenings, for troubleshooting (window.__bauer.log in the panel's devtools). */
  log: string[] = [];
  private note(s: string): void {
    this.log.push(`${new Date().toLocaleTimeString()} ${s}`);
    if (this.log.length > 60) this.log.shift();
  }
  private emit(e: EngineEvent): void {
    if (e.type !== "level")
      this.note(
        e.type === "transcript"
          ? `transcript: ${e.text}`
          : e.type === "error"
            ? `error: ${e.message}`
            : e.type,
      );
    this.listeners.forEach((l) => l(e));
  }

  // ---------- Microphone ----------

  private micOpening: Promise<void> | null = null;
  private openMic(): Promise<void> {
    if (this.ctx) return Promise.resolve();
    this.micOpening ??= this.reallyOpenMic().finally(
      () => (this.micOpening = null),
    );
    return this.micOpening;
  }
  private async reallyOpenMic(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.ctx = new AudioContext({ sampleRate: RATE });
    const src = this.ctx.createMediaStreamSource(this.stream);
    // The audio thread collects samples and posts them here. If this page is busy for a
    // moment (e.g. loading the speech model), they queue up instead of being lost.
    await this.ctx.audioWorklet.addModule(
      URL.createObjectURL(new Blob([TAP], { type: "text/javascript" })),
    );
    this.node = new AudioWorkletNode(this.ctx, "studyhall-tap", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) =>
      this.onFrame(e.data);
    src.connect(this.node);
    this.node.connect(this.ctx.destination); // (outputs silence; keeps it running)
  }

  private closeMic(): void {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }

  // ---------- The PC's sound (only while Ctrl+Alt+Shift is held) ----------

  private async openPc(): Promise<void> {
    this.pcRec = [];
    // (automated tests hand in a recording instead: they never capture the PC's real sound)
    const test = (window as unknown as { __hearTest?: Float32Array })
      .__hearTest;
    if (test) {
      this.pcRec.push(test);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
      stream.getVideoTracks().forEach((t) => t.stop()); // (only the sound is wanted)
      const audio = stream.getAudioTracks();
      if (!audio.length || this.pcRec == null) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AudioContext({ sampleRate: RATE });
      const src = ctx.createMediaStreamSource(new MediaStream(audio));
      await ctx.audioWorklet.addModule(
        URL.createObjectURL(new Blob([TAP], { type: "text/javascript" })),
      );
      const node = new AudioWorkletNode(ctx, "studyhall-tap", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (e: MessageEvent<Float32Array>) =>
        this.pcRec?.push(e.data);
      src.connect(node);
      node.connect(ctx.destination); // (outputs silence; keeps it running)
      this.pc = { stream, ctx, node };
      this.note("hearing the PC too");
    } catch (e) {
      this.note(
        `couldn't hear the PC: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Stops hearing the PC; what it played (if anything was audible). */
  private closePc(): Float32Array | null {
    const chunks = this.pcRec;
    this.pcRec = null;
    const p = this.pc;
    this.pc = null;
    if (p) {
      p.node.disconnect();
      p.stream.getTracks().forEach((t) => t.stop());
      void p.ctx.close();
    }
    if (!chunks?.length) return null;
    const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      audio.set(c, at);
      at += c.length;
    }
    let sum = 0;
    for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i];
    return Math.sqrt(sum / Math.max(1, audio.length)) > 0.003 ? audio : null;
  }

  // ---------- Wake word ----------

  private modelLoading: Promise<void> | null = null;
  private loadWake(): Promise<void> {
    this.modelLoading ??= (async () => {
      const { createModel } = await import("vosk-browser");
      this.model = await createModel(`${MODELS}vosk-small-en.tar.gz`, -1);
      this.newRecognizer();
      this.note("wake word ready");
    })().catch((e) => {
      this.modelLoading = null;
      throw e;
    });
    return this.modelLoading;
  }

  private newRecognizer(): void {
    if (!this.model) return;
    this.kws?.remove();
    const r = new this.model.KaldiRecognizer(RATE, GRAMMAR);
    r.setWords(true);
    r.on("partialresult", (m) => {
      const text = (m as { result: { partial: string } }).result.partial;
      if (text && text !== this.lastPartial) this.note(`partial: ${text}`);
      this.lastPartial = text;
      if (
        this.sensitivity >= 50 &&
        (STRONG.test(text) || (this.sensitivity >= 80 && LOOSE.test(text)))
      )
        this.onWake();
    });
    r.on("result", (m) => {
      const res = (
        m as {
          result: { text: string; result?: { conf: number; word: string }[] };
        }
      ).result;
      const text = res.text ?? "";
      if (text)
        this.note(
          `heard: ${text} ${JSON.stringify(res.result?.map((w) => [w.word, +w.conf.toFixed(2)]) ?? [])}`,
        );
      const strong = STRONG.test(text);
      if (!strong && !(this.sensitivity >= 65 && LOOSE.test(text))) return;
      const words = (res.result ?? []).filter((w) =>
        /^(?:bauer|bower|power|our)$/.test(w.word),
      );
      const conf = words.length ? Math.max(...words.map((w) => w.conf)) : 0;
      const need = 0.95 - this.sensitivity * 0.005; // 0.95 (strict) … 0.45 (eager)
      if (conf >= need) this.onWake();
    });
    this.kws = r;
  }

  /** The new ears heard "Hey <name>" (in the main process). */
  externalWake(): void {
    this.onWake();
  }

  private onWake(): void {
    if (this.mode !== "wake" || this.held || Date.now() - this.lastWake < 2500)
      return;
    this.lastWake = Date.now();
    stopSpeaking();
    if (!this.ears) this.newRecognizer(); // forget what was heard so far
    this.emit({ type: "wake" });
    this.startRecording(true);
  }

  // ---------- Recording a briefing ----------

  private startRecording(fromWake: boolean): void {
    if (fromWake) this.waitS = 7;
    // Keep the last ~1.3 s, so the wake word itself is in the recording: what's written down
    // can then be checked for "Hey Bauer" (false wake-ups from other talk are thrown away).
    this.rec = fromWake ? this.preroll.slice(-10) : [];
    this.spoke = false;
    this.silentFrames = 0;
    this.recFrames = 0;
    this.mode = "record";
    if (!this.ears)
      void this.loadAsr().catch((e) =>
        this.emit({ type: "error", message: errText(e) }),
      ); // warm up while you talk
  }

  private onFrame(f: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);

    if (this.mode === "wake") {
      this.preroll.push(f);
      if (this.preroll.length > 12) this.preroll.shift();
      this.noise = this.noise * 0.97 + Math.min(rms, this.noise * 3) * 0.03;
      // While Nova is talking, the wake word doesn't listen (so it never wakes itself).
      if (isSpeaking()) return;
      if (this.ears) api.ears.feed(f);
      else this.kws?.acceptWaveformFloat(f, RATE);
      return;
    }
    if (this.mode !== "record") return;

    this.rec.push(f);
    this.recFrames++;
    const threshold = Math.max(0.012, this.noise * 3.2);
    this.emit({ type: "level", value: Math.min(1, rms / 0.12) });
    if (rms > threshold) {
      if (!this.spoke) this.emit({ type: "heard" });
      this.spoke = true;
      this.silentFrames = 0;
    } else this.silentFrames++;
    const seconds = (this.recFrames * FRAME) / RATE;
    const pause = (this.silentFrames * FRAME) / RATE;
    if (this.ptt) {
      if (seconds >= 120) void this.finish(); // (the talk key is still held after two minutes)
    } else if ((this.spoke && pause >= 1.0) || seconds >= 45)
      void this.finish(); // (a one-second pause ends it, like Roamies)
    else if (!this.spoke && seconds >= this.waitS) {
      this.mode = this.wake ? "wake" : "idle";
      this.rec = [];
      this.emit({ type: "nothing" });
      if (!this.wake) this.closeMic();
    }
  }

  /** Stop recording now and write down what was said (the "Done" button). */
  async finish(): Promise<void> {
    if (this.mode !== "record") return;
    this.mode = "busy";
    const pushToTalk = this.ptt;
    this.ptt = false;
    const chunks = this.rec;
    this.rec = [];
    this.emit({ type: "recorded" });
    if (!this.wake) this.closeMic();
    try {
      const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) {
        audio.set(c, at);
        at += c.length;
      }
      this.lastAudio = audio;
      const pcAudio = this.closePc();
      // A quick tap of the talk key with nothing said (and nothing playing): just close.
      if (pushToTalk && !this.spoke && !pcAudio) {
        this.emit({ type: "nothing" });
        return;
      }
      const text =
        this.spoke || !pushToTalk ? await this.transcribe(audio) : "";
      const pc = pcAudio ? await this.transcribe(pcAudio).catch(() => "") : "";
      this.emit(
        text || pc
          ? { type: "transcript", text, ...(pcAudio ? { pc } : {}) }
          : { type: "nothing" },
      );
    } catch (e) {
      this.emit({ type: "error", message: errText(e) });
    } finally {
      this.mode = this.wake ? "wake" : "idle";
    }
  }

  /** Abandon the current recording. */
  cancel(): void {
    this.ptt = false;
    this.closePc();
    if (this.mode === "record") {
      this.rec = [];
      this.mode = this.wake ? "wake" : "idle";
      if (!this.wake) this.closeMic();
    }
  }

  // ---------- Whisper ----------

  private loadAsr(): Promise<void> {
    if (this.asr) return Promise.resolve();
    this.asrLoading ??= (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = MODELS;
      env.useBrowserCache = false;
      (env as { useWasmCache?: boolean }).useWasmCache = false;
      const wasm = env.backends.onnx.wasm as {
        wasmPaths?: unknown;
        numThreads?: number;
        proxy?: boolean;
      };
      wasm.wasmPaths = {
        mjs: new URL(ortMjs, location.href).href,
        wasm: new URL(ortWasm, location.href).href,
      };
      wasm.numThreads = self.crossOriginIsolated
        ? Math.max(
            1,
            Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)),
          )
        : 1;
      wasm.proxy = false;
      const t0 = Date.now();
      this.note(`loading speech model (${wasm.numThreads} threads)`);
      const asr = await pipeline(
        "automatic-speech-recognition",
        "Xenova/whisper-base.en",
        { dtype: "q8", device: "wasm" },
      );
      this.asr = asr as unknown as typeof this.asr;
      this.note(`speech model ready in ${Date.now() - t0} ms`);
    })();
    return this.asrLoading.catch((e) => {
      this.asrLoading = null;
      throw e;
    });
  }

  async transcribe(audio: Float32Array): Promise<string> {
    if (this.ears) {
      const t0 = Date.now();
      const text = await api.ears.transcribe(audio);
      this.note(
        `Parakeet wrote down ${(audio.length / 16000).toFixed(1)} s in ${Date.now() - t0} ms`,
      );
      return text.replace(/\s+/g, " ").trim();
    }
    // Never leave the panel spinning: give up after two minutes.
    const timeout = new Promise<never>((_r, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Writing it down took too long. Try again, or restart Studyhall.",
            ),
          ),
        120_000,
      ),
    );
    await Promise.race([this.loadAsr(), timeout]);
    const t0 = Date.now();
    // Longer than Whisper's 30-second window: read it in overlapping pieces.
    const opts =
      audio.length > 30 * 16000
        ? { chunk_length_s: 30, stride_length_s: 5, max_new_tokens: 220 }
        : { max_new_tokens: 220 };
    const out = await Promise.race([this.asr!(audio, opts), timeout]);
    this.note(
      `transcribed ${(audio.length / 16000).toFixed(1)} s in ${Date.now() - t0} ms`,
    );
    const text =
      (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text) ?? "";
    // Whisper writes "[BLANK_AUDIO]" / "(music)" for silence.
    const clean = text
      .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Very rarely the model gets stuck repeating itself ("inafinafinaf…"): say so instead.
    if (/(.{2,12}?)\1{6,}/i.test(clean.replace(/\s+/g, "")))
      throw new Error(
        "I couldn’t make that out. Try again a little closer to the microphone.",
      );
    return clean;
  }

  // ---------- Controls ----------

  /** Turn the always-on wake word on or off. */
  async setWake(on: boolean, sensitivity: number, ears = false): Promise<void> {
    this.sensitivity = sensitivity;
    const switchedEars = ears !== this.ears;
    this.ears = ears;
    if (on === this.wake && !switchedEars && (this.mode !== "idle" || !on))
      return;
    this.wake = on;
    if (on) {
      if (!ears) await this.loadWake();
      await this.openMic();
      if (this.mode === "idle") this.mode = "wake";
    } else {
      if (this.mode === "wake") {
        this.mode = "idle";
        this.closeMic();
      }
    }
  }

  /** Start listening for a briefing now (no wake word needed). */
  async listen(pushToTalk = false, waitS = 7, hearPc = false): Promise<void> {
    stopSpeaking(); // talking to Nova interrupts it
    if (this.mode === "record" || this.mode === "busy") return;
    await this.openMic();
    this.startRecording(false);
    this.ptt = pushToTalk;
    this.waitS = waitS; // how long to wait for you to start talking (a follow-up waits less)
    if (hearPc) void this.openPc();
  }
  /** Seconds to wait for speech to start before giving up. */
  private waitS = 7;

  get pushToTalk(): boolean {
    return this.ptt;
  }

  get recording(): boolean {
    return this.mode === "record";
  }
}

const errText = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e);
  if (/Permission|NotAllowed/i.test(m))
    return "Studyhall isn’t allowed to use the microphone. Check Windows Settings → Privacy → Microphone.";
  if (/NotFound|Requested device not found/i.test(m))
    return "No microphone found.";
  return m;
};

export const engine = new Engine();

/** A short two-note chime ("I'm listening"). */
export function chime(up = true): void {
  try {
    const ctx = new AudioContext();
    const notes = up ? [660, 880] : [700, 520];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      const t = ctx.currentTime + i * 0.11;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.18);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* no sound is fine */
  }
}
