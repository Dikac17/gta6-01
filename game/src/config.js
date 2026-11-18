// Every tuning number and colour in one place for PALMERA BAY, an open-world
// crime game in the browser. The city is a fixed-size grid (metres); nothing
// below depends on the screen size.

export const STEP = 1 / 60; // fixed simulation step, seconds

export const CITY = {
  half: 120, // playable square is -120..120 on both axes
  roadLines: [-80, -40, 0, 40, 80], // grid roads on both axes
  roadWidth: 9,
  beachZ: 96, // sand starts here (south edge)
  waterZ: 112, // sea starts here
  seedDefault: 20261118,
};

export const PLAYER = {
  radius: 0.55,
  height: 1.8,
  walkSpeed: 5.2,
  runSpeed: 8.6,
  accel: 42,
  jumpSpeed: 8.5,
  gravity: 24,
  maxHp: 100,
};

export const CAR = {
  enterRange: 4.2,
  crashDamage: 6,
};

export const WANTED = {
  max: 5,
  decayAfter: 30, // seconds without crime before it starts falling
  decayEvery: 12, // seconds per star lost while hidden
  steal: 1,
  hitPed: 1,
  shootCop: 1,
  ramCop: 1,
};

export const MISSIONS = [
  {
    id: 'parcel',
    title: 'MISSION 1 — Packages for Mama Rosa',
    brief: 'Deliver 3 packages to the yellow markers. On foot or by car.',
    reward: 300,
    drops: [
      [60, -60],
      [-60, 40],
      [20, 84],
    ],
  },
  {
    id: 'chase',
    title: 'MISSION 2 — Chase the Rival Courier',
    brief: 'The rival courier is fleeing in an orange car. Tail him until you are close!',
    reward: 500,
  },
  {
    id: 'escape',
    title: 'MISSION 3 — Escape the Police',
    brief: 'The police are closing in! Reach the safehouse garage in the north-west before you get caught.',
    reward: 800,
  },
];

export const PALETTE = {
  skyDay: 0x87ceeb,
  skyNight: 0x0b1026,
  fogDay: 0x9fd8ef,
  fogNight: 0x0d1526,
  sun: 0xfff2cc,
  ground: 0x9aa08a,
  road: 0x3c4148,
  roadLine: 0xf5d76e,
  sidewalk: 0xb9b3a4,
  sand: 0xf2dfa8,
  water: 0x1e90d6,
  waterDeep: 0x0b5f9e,
  // pastel / terracotta building colours, sunny coastal town
  buildings: [0xf6a5a5, 0xf9d976, 0x8ecae6, 0x90be6d, 0xf28482, 0xffb703, 0xffffff, 0xffd6a5, 0x84a98c, 0xe5989b],
  palmTrunk: 0x8a5a2b,
  palmLeaf: 0x2f9e44,
  lamp: 0x2b2b2b,
};

export const SAVE_KEY = 'palmera-bay-save-v1';
export const MONEY_START = 50;
