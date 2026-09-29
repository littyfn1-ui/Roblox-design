# Generates index.html from edl.json so picture cuts, captions and the audio edit
# all come from one cut list. Run: python3 build.py
import json

e = json.load(open("edl.json"))
W, H = 1080, 1920
VW = 1920 * H / 1080  # scaled source width (3413.3px) when the video fills 1920px tall

vids, caps = [], []
for i, c in enumerate(e["cuts"]):
    left = W / 2 - c["fx"] * VW
    vids.append(
        f'            <div class="vw" id="w-{c["id"]}" data-layout-allow-overflow="true"><div class="zoom" id="z-{c["id"]}">'
        f'<video id="v-{c["id"]}" src="{e["source"]}" data-start="{c["at"]:g}" data-duration="{c["dur"]:g}" '
        f'data-media-start="{c["src"]:g}" data-playback-rate="{c["rate"]:g}" data-track-index="{1 + i % 2}" '
        f'muted playsinline style="left: {left:.1f}px"></video></div></div>'
    )
    if c["lines"]:
        # the hook caption holds across the slow-mo cut and the impact cut
        dur = c["dur"] + (1.0 if c["id"] == "c1" else 0)
        spans = []
        for j, (col, txt) in enumerate(c["lines"]):
            size = min(170, int(1000 / (0.74 * len(txt))))
            spans.append(f'<span class="ln {col}" id="t-{c["id"]}-{j}" style="font-size: {size}px">{txt}</span>')
        caps.append(f'''            <div class="cap clip" id="cap-{c["id"]}" data-start="{c["at"]:g}" data-duration="{dur:g}" data-track-index="{3 + i % 5}">
              {"".join(spans)}
            </div>''')

tpl = open("index.tpl").read()
out = tpl.replace("<!--VIDEOS-->", "\n".join(vids)).replace("<!--CAPTIONS-->", "\n".join(caps))
out = out.replace("/*EDL*/", json.dumps([{k: c[k] for k in ("id", "at", "dur", "lines")} for c in e["cuts"]]))
open("index.html", "w").write(out)
print("wrote index.html:", len(vids), "cuts,", len(caps), "captions")
