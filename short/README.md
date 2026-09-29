# THE BAN HAMMER (YouTube Short)

A 30 second, 1080x1920, 60fps Roblox-style Short made entirely from code with
[HyperFrames](https://hyperframes.heygen.com): HTML, CSS, SVG and GSAP for the
picture, and the Web Audio API (OfflineAudioContext) for the soundtrack. No images,
footage, samples or generated media.

- Beat sheet: `videos/ban-hammer/STORYBOARD.md`
- Picture: `videos/ban-hammer/index.html` (camera rig, background, impacts) and
  `videos/ban-hammer/compositions/act-*.html` (the 24 shots, in 5 acts)
- Soundtrack source: `soundtrack/soundtrack.js` (120 BPM phonk, synthesized oof,
  risers, booms), rendered to `videos/ban-hammer/assets/soundtrack.wav`

## Rebuild

Needs Node 22+, FFmpeg and Chrome/Chromium.

```bash
npm install
# soundtrack -> WAV (last arg is the mix gain in dB)
node soundtrack/render.mjs videos/ban-hammer/assets/soundtrack.wav -4
# picture + audio -> MP4
cd videos/ban-hammer
npx hyperframes check .
npx hyperframes render . -f 60 -q delivery -o renders/ban-hammer.mp4
```

`soundtrack/render.mjs` points at the Chromium path used in the cloud build
environment; change `executablePath` to your own Chrome to run it locally.
