// Renders soundtrack.js with OfflineAudioContext inside headless Chromium and
// writes the WAV. Usage: node render.mjs <out.wav> [gainDb]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
const gainDb = Number(process.argv[3] ?? 0);
// Optional third argument: which arrangement file to render (default soundtrack.js).
const src = process.argv[4] ?? "soundtrack.js";
const code = readFileSync(join(here, src), "utf8").replace(/^export /m, "");

const browser = await puppeteer.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
await page.goto("about:blank");
const result = await page.evaluate(
  async (src, gain) => {
    const fn = new Function(`${src}; return renderSoundtrack;`)();
    const { wav, stats } = await fn({ gainDb: gain });
    let bin = "";
    for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
    return { b64: btoa(bin), stats };
  },
  code,
  gainDb,
);
await browser.close();
writeFileSync(out, Buffer.from(result.b64, "base64"));
console.log(JSON.stringify(result.stats, null, 2));
