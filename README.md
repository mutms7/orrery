# Orrery

A little N-body gravity sandbox that lives in a single canvas. No framework, no build step, just HTML, CSS, and one file of JavaScript. You charge up a body by holding, fling it into the field with a slingshot drag, and everything pulls on everything else with real inverse-square gravity. Bodies leave glowing trails, and when two of them touch they merge into one (conserving momentum) or bounce off, depending on how you've set it up.

It started as a "make something cool" afternoon and kept growing. The thing I like about it is that there's no goal, you just plant a star, sling a few worlds past it at the right speed, and watch whether they settle into orbits or fall in. Get it slightly wrong and a planet whips around once and slingshots off into the dark. Get it right and it'll circle quietly for as long as you leave it running.

🌐 **Play it live:** [orreryonline.vercel.app](https://orreryonline.vercel.app/)

On load you get a star with nine planets already in orbit, so there's something moving the moment it opens.

## Run it

Open `index.html` in any modern browser. That's the whole story, everything is inline and self-contained (no fonts or assets loaded off the network, so it works offline).

Or serve it if you'd rather:

```
npx serve .
```

## How you add things

Left-click and drag on empty space, then let go. That flings a new body. The longer you hold before releasing, the heavier it gets (and the color shifts from cool cyan through magenta to hot amber as the mass climbs). The drag itself is a slingshot: pull back and a dashed arrow shows which way it'll launch.

There are three spawn modes along the bottom, and the number keys switch between them:

| Mode | Key | What it does |
| --- | --- | --- |
| **Fling** | `1` | Charge and slingshot, the default. |
| **Orbit** | `2` | Drops a body already moving at the right speed to circle whatever's pulling on it hardest. Instant clean orbit, no aiming needed. |
| **Anchor** | `3` | Plants a fixed dark gravity well. It never moves, but everything else feels it. Good for building structures to sling things around. |

## Presets and tuning

The **Tune** button (the gear) opens a panel with a handful of ready-made systems and the physics knobs.

| System | What you get |
| --- | --- |
| **Solar** | A star with a spread of planets, the default starting layout. |
| **Binary** | Two heavy bodies orbiting their shared center, with satellites weaving around both. |
| **Rings** | A dense ring of small bodies circling one star. |
| **Big Bang** | A star-less burst that flies outward and slowly clumps back together under its own gravity. |
| **Chaos** | A cold cluster of random bodies, no star, that collapses and merges into a few heavy survivors. |
| **Empty** | A blank field. Build your own. |

The sliders let you change gravity strength, simulation speed, and the central star's mass while it's running, so you can watch orbits stretch and tighten in real time. Collisions have three modes: **Merge** (inelastic, the survivors keep the combined mass and momentum), **Bounce** (elastic, they ricochet off each other), and **Off** (they pass straight through). You can also color bodies by mass or by speed, and set how long the trails linger.

## Controls

- **Left-drag** flings a body (or drops an orbit / anchor, depending on the mode)
- **Scroll** zooms toward the cursor, **right-drag** pans, and on a trackpad two-finger drag pans too
- The **+ / − / home** buttons on the right zoom and reset the view; `r` also resets it
- **1 / 2 / 3** pick the spawn mode, **space** pauses, `c` clears, `g` triggers a Big Bang
- **Hover** any body to read its mass and velocity
- **Save** exports the current frame as a PNG

## How it works

The core is a straightforward N-body loop. Every movable body feels the pull of every other body with mass (the star and any anchors included) using softened inverse-square gravity, and I integrate with semi-implicit Euler, which is the cheap integrator that happens to conserve orbital energy well, so circles stay circles instead of slowly spiraling out. The timestep is split into small sub-steps and there's a velocity cap, which together keep close encounters from blowing up when two bodies nearly collide.

Collisions are resolved as a pass over body pairs. In merge mode a hit combines two bodies into one at their center of mass, summing mass and conserving momentum, and a body that falls into the star or an anchor just gets swallowed. In bounce mode I resolve an elastic impulse along the contact normal and nudge the pair apart so they don't overlap.

Rendering is all Canvas 2D. Bodies are drawn additively so their glows blend where they overlap, trails are per-body polylines faded from tail to head in the body's own color, and there's a parallax starfield behind it all. A camera transform (a pan offset plus a zoom scale) sits between world coordinates and screen pixels, so zooming and panning just change how the same simulation gets projected.

The whole thing is one `index.html`. There's a small test suite in `test/` that loads that file, stubs out the DOM and canvas, runs the actual simulation headless, and checks the physics holds up (orbits stay bound, merges conserve, speeds stay capped, nothing goes NaN). It also checks the page is self-contained and the script tag is closed, because an unclosed `<script>` is exactly the kind of thing that renders fine in a test harness and a blank screen in a browser.
