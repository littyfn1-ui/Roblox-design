---
title: "THE BAN HAMMER"
message: "An unreleased admin Ban Hammer bans everyone it touches, and now it's in your server."
audience: Roblox players on YouTube Shorts
mode: autonomous
canvas: 1080x1920
fps: 60
duration: 30
tempo: "120 BPM, 4/4, D minor. 1 beat = 0.5s = 30 frames. 30s = 15 bars exactly."
rhythm: "hook-hook-hit | chat-SLAM-hold-swing-IMPACT-ramp-hold | turn-SILENCE | DROP x8 (1s cuts) | half-time loop-back"
---

# Beat sheet

Every cut lands on a 2-beat (1.0s) or 3-beat (1.5s) boundary. Captions are 1 to 4
words and stay on screen for the whole shot. Each shot: what's on screen, what the
viewer should take in, what the audio does.

Built as one monolithic composition (`index.html`): one camera rig with continuous
handheld drift (registry `camera-shake`), per-shot shift-lock zoom wrappers, and an
impact-shake wrapper, so camera motion carries across cuts. Motion rules cited:
`kinetic-beat-slam` (text hits on the tempo grid, distinct entrances), registry
`rgb-glitch-text` (red/cyan split on BANNED / ERROR), `particle-burst`,
`scale-swap-transition`, `motion-blur-streak` (whips and speed ramps).

## Frame 1 — Cold open hook (0.0 to 4.0s, bars 1-2)

- status: built
- src: index.html
- blueprint: kinetic-beat-slam

| t | on screen | viewer takes in | audio |
|---|---|---|---|
| 0.0-1.5 | Camera starts at 2.0x on a glowing hammer floating over the last obby stage, snaps out to 1.5x. "THIS ITEM / DOESN'T EXIST" slams in by 0.15s | a forbidden item, right now | sub boom + full beat drops in on frame 0, cowbell riff |
| 1.5-3.0 | Close-up of the hammer head, cyan runes; item card slides in: "[ADMIN] BAN HAMMER", red UNRELEASED stamp | it's the BAN HAMMER, admin only | whoosh on cut, stamp hit on beat |
| 3.0-4.0 | Noob jumps onto the stage and grabs it; hotbar slot 1 pops with the hammer | I got it | pickup sparkle + kick |

## Frame 2 — Escalation (4.0 to 14.5s, bars 3-7)

- status: built
- src: index.html
- rules: kinetic-beat-slam, rgb-glitch-text, particle-burst

| t | on screen | viewer takes in | audio |
|---|---|---|---|
| 4.0-5.5 | Chat box slams in, lines pop on 16ths: "who has the hammer??" / "bro WHAT" / "report him" | everyone saw it | chat blips on the grid |
| 5.5-6.5 | Red "ADMIN JOINED" banner; admin drops from the top, screen shakes | the stakes just jumped | alarm stab + boom |
| 6.5-8.0 | Shift-lock push to 1.8x on the admin; speech bubble "DROP IT. NOW." | a direct threat | beat thins, filter dips |
| 8.0-9.0 | Over-the-shoulder shift-lock (crosshair), I wind up and swing, speed ramp slow to fast; "NO." | I refuse | reverse swell into swing whoosh |
| 9.0-10.0 | IMPACT: admin launched spinning; BANNED glitch stamp; shake; player count 12 to 11 | the hammer bans people | impact boom + oof + stinger |
| 10.0-11.5 | Player list: names struck out faster and faster (speed ramp), 11 to 2 | it bans ANYONE | accelerating oofs |
| 11.5-13.0 | Empty obby, giant "1/12" | only me left | music low-passed, riser starts |
| 13.0-14.5 | The hammer in my hand slowly turns to face camera, red glint | it has a will of its own | string stinger, riser climbs |

## Frame 3 — Pre-drop (14.5 to 16.0s, bar 8)

- status: built
- src: index.html
- rules: scale-swap-transition

| t | on screen | viewer takes in | audio |
|---|---|---|---|
| 14.5-16.0 | POV looking up: hammer rises overhead in slow motion, vignette closes; "WAIT" | it's about to hit ME | snare roll accelerates, then 0.5s of silence |

## Frame 4 — Drop / chaotic climax (16.0 to 24.0s, bars 9-12, 1.0s cuts)

- status: built
- src: index.html
- rules: rgb-glitch-text, particle-burst, motion-blur-streak

| t | on screen | viewer takes in | audio |
|---|---|---|---|
| 16.0-17.0 | Hammer smashes the lens, glass cracks, red flash: "YOU'RE BANNED" | I got banned | MASSIVE sub boom, drop hits |
| 17.0-18.0 | The noob breaks into six body parts flying outward: "OOF" | classic Roblox death | big oof |
| 18.0-19.0 | Roblox disconnect dialogs cascade: "ERROR 267" | kicked from the game | glitch stutter |
| 19.0-20.0 | Profile card, username struck out, red TERMINATED stamp: "ACCOUNT: GONE" | it went all the way | impact |
| 20.0-21.0 | The hammer spins alone in the void with cyan trails: "IT'S STILL OUT THERE" | the threat continues | whoosh |
| 21.0-22.0 | Server browser rows whip past, 12/12 flipping to 0/12: "SERVER AFTER SERVER" | it's spreading | ticking stutters |
| 22.0-23.0 | The hammer rockets at camera through a portal ring: "NEXT STOP:" | where is it going? | short riser |
| 23.0-24.0 | "YOUR SERVER" + system chat "Ban Hammer joined the game" | it's coming for YOU | boom |

## Frame 5 — Loop back (24.0 to 30.0s, bars 13-15)

- status: built
- src: index.html
- rules: kinetic-beat-slam

| t | on screen | viewer takes in | audio |
|---|---|---|---|
| 24.0-25.5 | Your hotbar, slot 1 "???" blinking cyan: "CHECK SLOT 1" | personal, direct | half-time breakdown |
| 25.5-27.0 | The hammer lands on your obby's last stage: "DON'T / PICK IT UP" | the warning | landing thud |
| 27.0-28.5 | POV: your hand reaching toward it, slowing: "SERIOUSLY." | you're going to anyway | tension, filter closes |
| 28.5-30.0 | Camera pushes 1.0x to 2.0x onto the floating hammer, same framing as frame 0 | (loop) | riser + snare roll resolves into the boom at 0.0 |
