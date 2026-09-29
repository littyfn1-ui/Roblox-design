<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>THE CHAIR IS THE GHOST</title>
    <!-- Generated from edl.json + index.tpl by build.py. Edit those, not this file. -->
    <script src="./assets/gsap.min.js"></script>
    <script src="./assets/camera-shake.js"></script>
    <script src="./assets/lib.js"></script>
    <style>
      :root {
        --y: #ffd700;
        --r: #ff1e27;
        --c: #00ffff;
        --paper: #fffdf2;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #0f0f12;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0f0f12;
        font-family: "Archivo Black", sans-serif;
      }
      #frame,
      #shake,
      #rig {
        position: absolute;
        inset: 0;
      }
      #frame {
        overflow: hidden;
      }
      #rig {
        transform-style: preserve-3d;
      }
      /* One untimed wrapper per cut: the wrapper frames it, the inner .zoom is the
         shift-lock camera, the timed <video> inside is the source range. */
      .vw,
      .zoom {
        position: absolute;
        inset: 0;
      }
      .vw video {
        position: absolute;
        top: 0;
        width: 3413.3px;
        height: 1920px;
      }
      /* Darken the top of frame so captions read over busy footage. */
      #scrim {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 1100px;
        background: linear-gradient(180deg, rgba(10, 10, 14, 0.55) 0%, rgba(10, 10, 14, 0.35) 45%, rgba(10, 10, 14, 0) 100%);
      }
      .cap {
        position: absolute;
        left: 0;
        right: 0;
        top: 300px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .ln {
        display: block;
        white-space: nowrap;
        text-transform: uppercase;
        line-height: 0.95;
        letter-spacing: -0.02em;
        color: var(--paper);
        -webkit-text-stroke: 18px #000;
        paint-order: stroke fill;
        text-shadow: 0 14px 0 #000;
      }
      .y {
        color: var(--y);
      }
      .r {
        color: var(--r);
      }
      .c {
        color: var(--c);
      }
      .w {
        color: var(--paper);
      }
      #flash {
        position: absolute;
        inset: 0;
        background: var(--paper);
        opacity: 0;
      }
      #pulse {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 50% 50%, rgba(255, 30, 39, 0) 40%, rgba(255, 30, 39, 0.5) 100%);
        opacity: 0;
      }
      #vignette {
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at 50% 45%, rgba(0, 0, 0, 0) 58%, rgba(0, 0, 0, 0.45) 100%);
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="22" data-width="1080" data-height="1920">
      <div id="frame">
        <div id="shake">
          <div id="rig">
<!--VIDEOS-->
          </div>
          <div id="scrim"></div>
<!--CAPTIONS-->
        </div>
      </div>
      <div id="pulse"></div>
      <div id="vignette"></div>
      <div id="flash"></div>

      <audio id="mix" src="./assets/mix.wav" data-start="0" data-duration="22" data-track-index="20" data-volume="1"></audio>
    </div>

    <script>
      // One paused timeline, 120 BPM grid (BEAT 0.5s, STEP 0.125s), positions in seconds.
      (function () {
        "use strict";
        var STEP = 0.125;
        var CUTS = /*EDL*/;
        var tl = gsap.timeline({ paused: true });
        var K = BH.kit(tl, 0);
        var say = K.say;

        function shake(t, amp, dur, seed) {
          var r = BH.rng(seed);
          var n = Math.max(5, Math.round(dur / 0.034));
          var d = dur / n;
          for (var i = 0; i < n; i++) {
            var k = 1 - i / n;
            tl.to("#shake", { x: (r() * 2 - 1) * amp * k, y: (r() * 2 - 1) * amp * k, rotation: (r() * 2 - 1) * amp * 0.03 * k, duration: d, ease: "none" }, t + i * d);
          }
          tl.to("#shake", { x: 0, y: 0, rotation: 0, duration: 0.03, ease: "none" }, t + dur);
        }
        function flash(t, color, peak, dur) {
          tl.set("#flash", { backgroundColor: color, opacity: peak }, t);
          tl.to("#flash", { opacity: 0, duration: dur, ease: "power2.out" }, t + 0.001);
        }
        function pump(t, amt, pulse) {
          tl.set("#shake", { scale: 1 + amt }, t);
          tl.to("#shake", { scale: 1, duration: 0.18, ease: "power2.out" }, t + 0.001);
          if (pulse) {
            tl.set("#pulse", { opacity: pulse }, t);
            tl.to("#pulse", { opacity: 0, duration: 0.3, ease: "power2.out" }, t + 0.001);
          }
        }
        // Shift-lock camera per cut: a snap on the cut, then a push (or a slow-mo creep).
        function zoom(id, origin, s0, s1, ease, snap) {
          var c = CUTS.filter(function (x) {
            return x.id === id;
          })[0];
          var sel = "#z-" + id;
          if (snap) {
            tl.fromTo(sel, { scale: snap[0], transformOrigin: origin }, { scale: s0, duration: snap[1], ease: "expo.out" }, c.at);
            tl.to(sel, { scale: s1, duration: c.dur - snap[1], ease: ease || "none" }, c.at + snap[1]);
          } else {
            tl.fromTo(sel, { scale: s0, transformOrigin: origin }, { scale: s1, duration: c.dur, ease: ease || "none" }, c.at);
          }
        }

        // Continuous handheld drift (registry camera-shake). The .zoom wrappers never
        // drop below 1.05x, so the drift never shows a frame edge.
        window.cameraShake(tl, "#rig", { profile: "handheld-normal-mild", intensity: 0.7, duration: 22, at: 0, fps: 30, overscan: 1.04 });

        zoom("c1", "540px 900px", 1.25, 1.45, "power2.in"); // slow-mo creep into the slam
        zoom("c2", "540px 900px", 1.12, 1.18, "none", [1.6, 0.25]); // impact punch-out
        zoom("c3", "540px 250px", 1.1, 1.2); // HUNTERS RELEASED banner
        zoom("c4", "540px 900px", 1.05, 1.32, "power1.in"); // suspicious push on the chair
        zoom("c5", "540px 800px", 1.12, 1.22, "none", [1.35, 0.2]);
        zoom("c6", "540px 700px", 1.1, 1.38, "power2.in"); // swoop
        zoom("c7", "540px 800px", 1.15, 1.28);
        zoom("c8", "540px 900px", 1.1, 1.42, "power2.in"); // drain build
        zoom("c9", "540px 900px", 1.12, 1.2, "none", [1.6, 0.25]); // the slam again
        zoom("c10", "540px 800px", 1.15, 1.25, "none", [1.55, 0.25]); // DROP
        zoom("c11", "540px 900px", 1.1, 1.38, "power2.in");
        zoom("c12", "540px 850px", 1.3, 1.55, "power1.out"); // slow-mo reveal
        zoom("c13", "540px 850px", 1.2, 1.06, "power1.out");
        zoom("c14", "540px 107px", 2.0, 2.1, "none", [1.05, 0.35]); // punch into the ghost-health HUD
        zoom("c15", "540px 700px", 1.1, 1.25, "power2.in"); // ends at c1's opening scale

        // Captions: distinct entrances, held for the whole cut.
        var ENTRY = { c1: ["slam", "pop"], c3: ["left", "right"], c4: ["rise", "rise"], c5: ["stamp"], c6: ["drop", "stamp"], c7: ["left", "slam"], c8: ["stamp"], c9: ["drop", "stamp"], c10: ["left", "right"], c11: ["slam", "slam"], c12: ["pop", "stamp"], c13: ["stamp"], c14: ["drop", "pop"], c15: ["rise", "pop"] };
        CUTS.forEach(function (c) {
          var end = c.at + c.dur + (c.id === "c1" ? 1 : 0);
          c.lines.forEach(function (line, j) {
            say("#t-" + c.id + "-" + j, ENTRY[c.id][j], c.at + j * STEP, end, 1.06);
          });
        });

        // Impacts, on the same beats as the booms and crashes in mix.wav.
        flash(0, "#fffdf2", 0.25, 0.15);
        flash(1.0, "#fffdf2", 0.7, 0.3);
        shake(1.0, 60, 0.45, 101); // the chair slams the lens
        shake(6.6, 30, 0.3, 66); // the swoop
        flash(10.5, "#00ffff", 0.55, 0.3);
        shake(10.5, 64, 0.45, 105); // GHOST EJECTED
        flash(12.0, "#ff1e27", 0.6, 0.3);
        shake(12.0, 56, 0.4, 120); // DROP
        flash(15.0, "#fffdf2", 0.6, 0.35);
        shake(15.0, 36, 0.35, 150); // the reveal
        shake(17.75, 40, 0.3, 177); // he runs through the camera

        // Beat pumps: light in the build, heavy in the drop (kicks on 16th steps 0,3,7,10).
        var bar;
        for (bar = 1; bar < 5; bar++) {
          [0, 7, 10].forEach(function (st) {
            pump(bar * 2 + st * STEP, 0.012, 0);
          });
        }
        for (bar = 6; bar < 9; bar++) {
          [0, 3, 7, 10].forEach(function (st) {
            pump(bar * 2 + st * STEP, st === 0 ? 0.035 : 0.022, st === 0 ? 0.7 : 0.4);
          });
        }

        window.__timelines["main"] = tl;
      })();
    </script>
  </body>
</html>
