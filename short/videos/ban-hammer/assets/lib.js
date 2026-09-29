// THE BAN HAMMER - shared builders + motion kit.
// Defines functions only (no DOM access at load), so it is safe wherever the
// compiler places it. Each composition calls these from its own inline script.
//
// Tempo grid: 120 BPM, BEAT = 0.5s, STEP (16th) = 0.125s. Every composition writes
// positions in GLOBAL seconds; BH.kit(tl, T0) shifts them into the composition's
// local time, so all acts share one grid with the soundtrack.
window.BH = (function () {
  "use strict";

  var BEAT = 0.5;
  var STEP = 0.125;

  function $(s) {
    return document.querySelector(s);
  }
  function $$(s, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(s));
  }
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Obby world (pseudo-3D blocks, drawn as SVG)
  // ---------------------------------------------------------------------------
  function block(x, y, w, h, d, kind) {
    var dx = 0.3 * d;
    var dy = 0.55 * d;
    var top, front, side, edge;
    if (kind === "kill") {
      top = "#ff1e27";
      front = "#b3121a";
      side = "#d0161f";
      edge = "#ffd700";
    } else if (kind === "stage") {
      top = "#2b2b36";
      front = "#17171d";
      side = "#202029";
      edge = "#ffd700";
    } else {
      top = "#262630";
      front = "#16161b";
      side = "#1d1d25";
      edge = "#00ffff";
    }
    var op = kind === "far" ? 0.5 : 1;
    var s = '<g opacity="' + op + '" stroke="#000" stroke-width="5" stroke-linejoin="round">';
    if (kind === "kill") {
      s += '<rect x="' + (x - 30) + '" y="' + (y - dy - 30) + '" width="' + (w + dx + 60) + '" height="' + (h + dy + 60) + '" rx="40" fill="#ff1e27" opacity="0.18" stroke="none"/>';
    }
    s += '<path d="M' + x + " " + y + "L" + (x + w) + " " + y + "L" + (x + w + dx) + " " + (y - dy) + "L" + (x + dx) + " " + (y - dy) + 'Z" fill="' + top + '"/>';
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + front + '"/>';
    s += '<path d="M' + (x + w) + " " + y + "L" + (x + w + dx) + " " + (y - dy) + "L" + (x + w + dx) + " " + (y - dy + h) + "L" + (x + w) + " " + (y + h) + 'Z" fill="' + side + '"/>';
    s += '<path d="M' + x + " " + y + "L" + (x + w) + " " + y + "L" + (x + w + dx) + " " + (y - dy) + '" fill="none" stroke="' + edge + '" stroke-width="4" stroke-opacity="0.9"/>';
    return s + "</g>";
  }

  var WORLD = null;
  function worldMarkup() {
    if (WORLD) return WORLD;
    var s = "";
    s += '<g stroke="#00ffff" stroke-opacity="0.22" stroke-width="3" fill="none">';
    [1540, 1572, 1612, 1664, 1730, 1812, 1910].forEach(function (y) {
      s += '<line x1="-200" y1="' + y + '" x2="1280" y2="' + y + '"/>';
    });
    for (var xb = -1020; xb <= 2100; xb += 240) {
      var k = (1520 - 1440) / (1920 - 1440);
      var xh = 540 + (xb - 540) * k;
      s += '<line x1="' + xh.toFixed(1) + '" y1="1520" x2="' + xb + '" y2="1920"/>';
    }
    s += "</g>";
    s += block(150, 880, 110, 30, 50, "far");
    s += block(820, 700, 100, 28, 44, "far");
    s += block(560, 520, 80, 24, 36, "far");
    s += block(300, 380, 70, 20, 30, "far");
    s += block(900, 300, 60, 18, 26, "far");
    s += block(40, 1480, 170, 48, 90, "normal");
    s += block(320, 1600, 130, 44, 80, "normal");
    s += block(600, 1520, 170, 40, 80, "kill");
    s += block(860, 1420, 150, 48, 80, "normal");
    s += '<rect x="800" y="990" width="30" height="220" fill="#1c1c24" stroke="#000" stroke-width="5"/>';
    s += '<rect x="690" y="912" width="330" height="92" rx="12" fill="#15151b" stroke="#000" stroke-width="6"/>';
    s += '<rect x="700" y="922" width="310" height="72" rx="8" fill="none" stroke="#00ffff" stroke-width="4"/>';
    s += '<text data-layout-allow-overlap="true" x="855" y="974" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="40" fill="#00ffff">STAGE 100</text>';
    s += block(230, 1250, 620, 110, 170, "stage");
    s += '<path d="M430 1236L650 1236L668 1203L448 1203Z" fill="#ffd700" stroke="#000" stroke-width="5" opacity="0.95"/>';
    var studs = "";
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 12; col++) {
        studs += '<ellipse cx="' + (262 + col * 50 + row * 16) + '" cy="' + (1226 - row * 30) + '" rx="12" ry="6" fill="#3a3a48"/>';
      }
    }
    s += '<g opacity="0.8">' + studs + "</g>";
    WORLD = s;
    return s;
  }

  function buildWorlds(root) {
    $$(".world", root).forEach(function (svg) {
      svg.innerHTML = worldMarkup();
    });
  }

  // ---------------------------------------------------------------------------
  // Avatars (blocky R6 bodies built from divs so every part can animate)
  // ---------------------------------------------------------------------------
  // Full shapes inline (the compiler rewrites <symbol> defs, so runtime-built
  // hammers can't rely on <use href>).
  var HAMMER_SVG =
    '<svg viewBox="0 0 400 620"><rect x="178" y="196" width="44" height="386" rx="8" fill="#1c1c24" stroke="#000" stroke-width="8" /> <rect x="174" y="410" width="52" height="20" fill="#ffd700" stroke="#000" stroke-width="5" /> <rect x="174" y="458" width="52" height="20" fill="#ffd700" stroke="#000" stroke-width="5" /> <rect x="174" y="506" width="52" height="20" fill="#ffd700" stroke="#000" stroke-width="5" /> <rect x="160" y="572" width="80" height="40" rx="8" fill="#ff1e27" stroke="#000" stroke-width="7" /> <rect x="14" y="52" width="40" height="150" rx="8" fill="#ff1e27" stroke="#000" stroke-width="8" /> <rect x="346" y="52" width="40" height="150" rx="8" fill="#ff1e27" stroke="#000" stroke-width="8" /> <rect x="44" y="30" width="312" height="194" rx="14" fill="#15151b" stroke="#000" stroke-width="10" /> <rect x="64" y="50" width="272" height="154" rx="8" fill="none" stroke="#00ffff" stroke-width="6" /> <path d="M84 72 h26 M84 72 v22 M316 72 h-26 M316 72 v22 M84 182 h26 M84 182 v-22 M316 182 h-26 M316 182 v-22" stroke="#00ffff" stroke-width="6" fill="none" /> <text data-layout-allow-overlap="true" x="200" y="166" text-anchor="middle" font-family="Archivo Black" font-size="104" fill="#ff1e27" stroke="#000" stroke-width="8" paint-order="stroke">BAN</text></svg>';

  function buildAvatars(root) {
    $$(".av", root).forEach(function (el) {
      var admin = el.classList.contains("admin");
      var front = el.getAttribute("data-view") !== "back";
      var held = el.getAttribute("data-held") === "true";
      var face = "";
      if (front) {
        face = admin
          ? '<div class="face"><div class="shades"></div><div class="smile"></div></div>'
          : '<div class="face"><i class="eye l"></i><i class="eye r"></i><div class="smile"></div></div>';
      }
      var hammer = held ? '<div class="grip"><div class="held hammer">' + HAMMER_SVG + "</div></div>" : "";
      el.innerHTML =
        '<div class="p leg l"></div><div class="p leg r"></div>' +
        '<div class="p torso"></div>' +
        '<div class="p arm l"></div>' +
        '<div class="p arm r">' + hammer + "</div>" +
        '<div class="p head">' + face + "</div>";
    });
  }

  // ---------------------------------------------------------------------------
  // Particles, cracks, server rows
  // ---------------------------------------------------------------------------
  var BURST_COLORS = ["#ffd700", "#00ffff", "#ff1e27", "#fffdf2"];
  function buildBurst(sel, count, seed, colors) {
    var el = $(sel);
    var palette = colors || BURST_COLORS;
    var r = rng(seed);
    var out = [];
    for (var i = 0; i < count; i++) {
      var p = document.createElement("i");
      p.style.background = palette[i % palette.length];
      var size = 14 + Math.floor(r() * 18);
      p.style.width = size + "px";
      p.style.height = size + "px";
      el.appendChild(p);
      var a = (i / count) * Math.PI * 2 + r() * 0.5;
      var dist = 220 + r() * 420;
      out.push({ el: p, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist - 120, rot: (r() * 2 - 1) * 540 });
    }
    return out;
  }

  function crackMarkup(cx, cy) {
    var r = rng(77);
    var under = "";
    var over = "";
    for (var i = 0; i < 14; i++) {
      var ang = (i / 14) * Math.PI * 2 + r() * 0.3;
      var pts = [[cx, cy]];
      var len = 0;
      var target = 500 + r() * 900;
      while (len < target) {
        var seg = 60 + r() * 110;
        ang += (r() * 2 - 1) * 0.35;
        len += seg;
        var last = pts[pts.length - 1];
        pts.push([last[0] + Math.cos(ang) * seg, last[1] + Math.sin(ang) * seg]);
      }
      var d = pts
        .map(function (p, j) {
          return (j ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
        })
        .join("");
      under += '<path d="' + d + '" stroke="#000" stroke-width="16" fill="none" stroke-linejoin="round"/>';
      over += '<path d="' + d + '" stroke="#fffdf2" stroke-width="6" fill="none" stroke-linejoin="round"/>';
    }
    var rings = "";
    [70, 150].forEach(function (rad) {
      var ring = "";
      for (var j = 0; j <= 10; j++) {
        var an = (j / 10) * Math.PI * 2;
        var rr = rad + (r() * 2 - 1) * 18;
        ring += (j ? "L" : "M") + (cx + Math.cos(an) * rr).toFixed(1) + " " + (cy + Math.sin(an) * rr).toFixed(1);
      }
      rings += '<path d="' + ring + 'Z" stroke="#000" stroke-width="14" fill="none"/>';
      rings += '<path d="' + ring + 'Z" stroke="#fffdf2" stroke-width="5" fill="none"/>';
    });
    return under + over + rings;
  }

  function rowsMarkup(prefix, count) {
    var r = rng(31);
    var html = "";
    for (var i = 0; i < count; i++) {
      html +=
        '<div class="row" style="top:' + (240 + i * 190) + 'px">' +
        '<span class="nm" data-layout-allow-overlap="true">Obby Server #' + (1000 + Math.floor(r() * 9000)) + "</span>" +
        '<span class="ct" data-layout-allow-overlap="true" id="' + prefix + "-full-" + i + '">12/12</span>' +
        '<span class="ct dead" data-layout-allow-overlap="true" id="' + prefix + "-dead-" + i + '" style="opacity:0">0/12</span>' +
        "</div>";
    }
    return html;
  }

  // ---------------------------------------------------------------------------
  // Motion kit. `tl` is the composition's paused timeline, `T0` its global start.
  // Every position passed in is in GLOBAL seconds.
  // ---------------------------------------------------------------------------
  function kit(rawTl, T0) {
    var tl = {
      to: function (a, b, p) {
        return rawTl.to(a, b, p - T0);
      },
      fromTo: function (a, b, c, p) {
        return rawTl.fromTo(a, b, c, p - T0);
      },
      set: function (a, b, p) {
        return rawTl.set(a, b, p - T0);
      },
    };

    // Distinct caption entrances (kinetic-beat-slam: vary the axis per phrase).
    var IN = {
      slam: function (el, t) {
        tl.fromTo(el, { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.14, ease: "power4.out" }, t);
        return 0.14;
      },
      left: function (el, t) {
        tl.fromTo(el, { x: -1000, skewX: 24 }, { x: 0, skewX: 0, duration: 0.16, ease: "expo.out" }, t);
        return 0.16;
      },
      right: function (el, t) {
        tl.fromTo(el, { x: 1000, skewX: -24 }, { x: 0, skewX: 0, duration: 0.16, ease: "expo.out" }, t);
        return 0.16;
      },
      drop: function (el, t) {
        tl.fromTo(el, { y: -460, rotation: -10 }, { y: 0, rotation: 0, duration: 0.2, ease: "back.out(2.2)" }, t);
        return 0.2;
      },
      pop: function (el, t) {
        tl.fromTo(el, { scale: 0, rotation: -8 }, { scale: 1, rotation: 0, duration: 0.2, ease: "back.out(3)" }, t);
        return 0.2;
      },
      stamp: function (el, t) {
        tl.fromTo(el, { scale: 3.2, rotation: 14, opacity: 0 }, { scale: 1, rotation: -3, opacity: 1, duration: 0.12, ease: "power4.in" }, t);
        return 0.12;
      },
      rise: function (el, t) {
        tl.fromTo(el, { y: 300, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, ease: "circ.out" }, t);
        return 0.18;
      },
    };

    // Enter, then keep drifting until the shot ends (nothing is ever still).
    function say(sel, how, t, shotEnd, drift) {
      var el = $(sel);
      var d = IN[how](el, t);
      var hold = shotEnd - (t + d);
      if (hold > 0.02) {
        if (how === "left" || how === "right") {
          tl.to(el, { x: how === "left" ? 26 : -26, duration: hold, ease: "none" }, t + d);
        } else {
          tl.to(el, { scale: drift || 1.06, duration: hold, ease: "none" }, t + d);
        }
      }
    }

    // Registry rgb-glitch-text pattern: red/cyan ghosts driven by --gx.
    function glitch(sel, t, dur, px) {
      var n = Math.max(1, Math.floor(dur / 0.05));
      tl.fromTo(sel, { "--gx": "0px" }, { "--gx": (px || 16) + "px", duration: 0.05, repeat: n - 1, yoyo: true, ease: "steps(1)" }, t);
      tl.set(sel, { "--gx": "4px" }, t + n * 0.05);
    }

    // particle-burst rule: deterministic spray.
    function fire(parts, t, dur) {
      parts.forEach(function (p, i) {
        tl.fromTo(
          p.el,
          { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
          { x: p.dx, y: p.dy, rotation: p.rot, scale: 0.35, opacity: 0, duration: dur, ease: "power2.out" },
          t + (i % 3) * 0.01,
        );
      });
    }

    // Shift-lock camera move on a shot's .cam wrapper.
    function cam(sel, origin, from, to, t, dur, ease) {
      from.transformOrigin = origin;
      to.duration = dur;
      to.ease = ease || "none";
      tl.fromTo(sel, from, to, t);
    }

    function glowPulse(sel, t, dur) {
      tl.fromTo(sel, { scale: 0.9, opacity: 0.8 }, { scale: 1.12, opacity: 1, duration: dur / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, t);
    }

    return { tl: tl, say: say, glitch: glitch, fire: fire, cam: cam, glowPulse: glowPulse };
  }

  return {
    BEAT: BEAT,
    STEP: STEP,
    rng: rng,
    $: $,
    $$: $$,
    buildWorlds: buildWorlds,
    buildAvatars: buildAvatars,
    buildBurst: buildBurst,
    crackMarkup: crackMarkup,
    rowsMarkup: rowsMarkup,
    kit: kit,
  };
})();
