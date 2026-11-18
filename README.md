# 🌴 PALMERA BAY — Open World Crime

![make.fun](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Dikac17/gta6-01/rank.svg)
![reward](https://make.fun/badge/gta6-01/Dikac17/gta6-01/reward.svg)

An original open-world crime game in the browser, built for the
[make.fun](https://make.fun) **gta6-01** competition ("Make GTA 6").
No Rockstar names, places, or assets — Palmera Bay, Rico Marlin, and Mama Rosa
are all original.

## The game

Welcome to **Palmera Bay**, a sunny coastal city: grid streets, pastel
buildings, a beach, a pier, a park, and traffic everywhere. You are
**Rico Marlin**, a freelance courier new in town. Finish three story missions
for your new boss, **Mama Rosa**, and become a street legend.

- **On foot** — third-person WASD + mouse look, run, jump, punch or pistol
- **Cars** — steal any of six parked cars (sedan, taxi, pickup, sports car,
  van…) and drive them; stealing raises your wanted level
- **Living city** — AI traffic follows the roads, pedestrians stroll the
  sidewalks and flee speeding cars
- **Wanted 1–5★** — police cars chase and ram you, foot officers chase and
  try to bust you; lay low and the heat cools off
- **3 story missions** — deliver parcels, tail the rival courier, then escape
  a full police hunt to the safehouse — plus win and game-over screens
- **HUD + live minimap** — wanted stars, HP, money, objective + distance,
  day/night clock, speed, and a minimap with roads, police, and objectives
- **Day/night cycle, procedural Web Audio** (engine, sirens, gunshots),
  particles, screen shake, pause, save/load, mute
- **Touch controls** — virtual joystick, camera drag, GAS/BRAKE/CAR/ATTACK/RUN
  buttons (shown on touch devices only)

## Run it

```sh
node serve.ts   # then open http://localhost:8080
```

No build step, no network: three.js is vendored under
`game/vendor/three/`, and everything else is plain ES modules.
Deterministic screenshots: open `?shot=cover|play|city|night&seed=1`.

## Tech

- three.js 0.187.0 (vendored, `game/vendor/three/`)
- InstancedMesh city (buildings, palms, lamps), one directional + one
  hemisphere light, fog — 59–80 draw calls in play
- Fixed 1/60 s simulation step; seeded RNG so the city and the screenshot
  poses are reproducible

## License

MIT — see [LICENSE](LICENSE).

---

Built with [make.fun](https://make.fun/r/1xzg4p72) — referral code `1xzg4p72`.
