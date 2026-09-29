# Pre-renders every cut of edl.json to a sharp 1080x1920 60fps clip, then joins them
# into assets/base.mp4 (picture only). HyperFrames adds captions, punch-ins, shakes
# and flashes on top.
#
# Layout per cut: the footage is cropped to 3:4 around the action and scaled 1.33x with
# lanczos + a light unsharp into a 1080x1440 band placed low (captions live above it);
# a blurred, darkened copy fills the
# frame behind it. Slow-mo cuts get motion-interpolated frames instead of repeats.
import json, os, subprocess, sys

e = json.load(open("edl.json"))
SRC = e["source"]
os.makedirs("cuts", exist_ok=True)
BAND_W, BAND_H, BAND_Y = 1080, 1440, 440

def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)

files = []
only = set(sys.argv[1:])  # optional: re-render just these cut ids
for c in e["cuts"]:
    out = f"cuts/{c['id']}.mp4"
    files_entry = out
    if only and c["id"] not in only:
        files.append(out)
        continue
    srcdur = c["dur"] * c["rate"]
    cx = c["fx"] * 1920
    if c.get("hud"):
        # tight crop on the ghost-health HUD at the top of the source
        cw, ch, cy = 608, 810, 0
    else:
        cw, ch, cy = 810, 1080, 0
    x = max(0, min(1920 - cw, cx - cw / 2))
    if c["rate"] != 1 and c.get("interp") == "blend":
        # very fast motion: cross-blend frames (motion blur) instead of motion vectors
        timing = f"setpts=PTS/{c['rate']},minterpolate=fps=60:mi_mode=blend"
    elif c["rate"] != 1:
        timing = f"setpts=PTS/{c['rate']},minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1"
    else:
        timing = "fps=60"
    fg = (f"crop={cw}:{ch}:{x:.0f}:{cy},scale={BAND_W}:{BAND_H}:flags=lanczos,"
          f"unsharp=5:5:0.7:5:5:0.0")
    bg = ("scale=-2:1920:flags=bilinear,crop=1080:1920:(iw-1080)/2:0,"
          "boxblur=40:2,eq=brightness=-0.22:saturation=0.75")
    fc = (f"[0:v]{timing},split[a][b];[a]{fg}[fg];[b]{bg}[bg];"
          f"[bg][fg]overlay=0:{BAND_Y},trim=duration={c['dur']},setpts=PTS-STARTPTS,format=yuv420p[v]")
    run(["-ss", str(c["src"]), "-t", f"{srcdur + 0.2:.3f}", "-i", SRC, "-filter_complex", fc,
         "-map", "[v]", "-an", "-r", "60", "-c:v", "libx264", "-preset", "medium", "-crf", "14", out])
    files.append(out)
    print("cut", c["id"], "ok")

with open("cuts/list.txt", "w") as f:
    for p in files:
        f.write(f"file '{os.path.basename(p)}'\n")
run(["-f", "concat", "-safe", "0", "-i", "cuts/list.txt", "-c:v", "libx264", "-preset", "medium",
     "-crf", "14", "-r", "60", "-pix_fmt", "yuv420p", "assets/base.mp4"])
print("assets/base.mp4 written")
