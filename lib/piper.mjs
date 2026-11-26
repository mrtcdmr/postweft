import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME } from "./data-home.mjs";

const installDir = fileURLToPath(new URL("../work/piper/", import.meta.url));

function options(settings) {
  const localBin = join(installDir, "venv/bin/piper");
  const bin = settings.piperBin || (existsSync(localBin) ? localBin : "piper");
  const model = settings.model || "en_US-lessac-medium";
  if (!isAbsolute(model) && !/^[\w-]+(?:\.onnx)?$/.test(model)) {
    throw new Error("voice.model must be a Piper voice name or an absolute path to an .onnx file");
  }
  const path = isAbsolute(model) ? model : join(installDir, "voices", model.endsWith(".onnx") ? model : model + ".onnx");
  const speed = settings.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(1 / speed)) {
    throw new Error("voice.speed must be a positive number for Piper");
  }
  if (!existsSync(path) || !existsSync(path + ".json")) {
    throw new Error(`Piper model or sidecar JSON is missing: ${path}. Run bash video/install-piper.sh <voice> or set voice.model.`);
  }
  return { bin: bin.includes("/") ? resolve(HOME, bin) : bin, model: path, speed };
}

export function checkPiper(settings) {
  const { bin } = options(settings);
  if (spawnSync(bin, ["--help"], { stdio: "ignore", timeout: 10000 }).status !== 0) {
    throw new Error("Piper could not run. Run bash video/install-piper.sh or set voice.piperBin.");
  }
}

export function piperVoice(settings, text) {
  const { bin, model, speed } = options(settings);
  const dir = mkdtempSync(join(tmpdir(), "postweft-piper-"));
  try {
    const out = join(dir, "line.wav");
    execFileSync(bin, ["-m", model, "-f", out, "--length_scale", String(1 / speed)], {
      input: text + "\n", stdio: ["pipe", "ignore", "pipe"], timeout: 120000,
    });
    const audio = readFileSync(out);
    if (audio.length <= 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error("Piper returned no WAV audio");
    }
    return audio;
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("Piper or its output is missing. Run bash video/install-piper.sh or check voice.piperBin and voice.model.");
    throw e;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
