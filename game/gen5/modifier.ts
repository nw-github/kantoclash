export const chainMod = (a: number, b: number) => (a * b + 0x800) >> 12;

export const chainModIf = (a: number, b: number, cond: any) => (!cond ? a : (a * b + 0x800) >> 12);

export const applyMod = (base: number, mod: number | false | null) => {
  const val = (base * (mod || Mod.NONE)) / 0x1000;
  const int = Math.floor(val);
  return int + Number(val - int > 0.5);
};

export const MOD_0_50 = 0x0800;
export const MOD_0_75 = 0x0c00;
export const MOD_1_20 = 0x1333;
export const MOD_1_25 = 0x1400;
export const MOD_1_30 = 0x14cd;
export const MOD_1_50 = 0x1800;
export const MOD_2_00 = 0x2000;

export const Mod = {
  NONE: 0x1000,
  TARGET_MULTI: MOD_0_75,

  WEATHER_BONUS: MOD_1_50,
  WEATHER_PENALTY: MOD_0_50,

  STAB: MOD_1_50,
  STAB_ADAPTABILITY: MOD_2_00,

  FINAL_SCREEN_MULTI_TARGET: 0x0a8f, // ~0.65
  FINAL_SCREEN_SINGLE_TARGET: MOD_0_50,

  FINAL_MULTISCALE: MOD_0_50,
  FINAL_TINTED_LENS: MOD_2_00,
  FINAL_FRIEND_GUARD: MOD_0_75,
  FINAL_SNIPER: MOD_1_50,
  FINAL_SOLID_ROCK: MOD_0_75,
  FINAL_FILTER: MOD_0_75,

  FINAL_METRONOME_BONUS: 0x333, // n <= 4 ? 0x1000 + 0x333 * n : 0x2000
  FINAL_METRONOME_GT4: MOD_2_00, // n <= 4 ? 0x1000 + 0x333 * n : 0x2000
  FINAL_EXPERT_BELT: MOD_1_20,
  FINAL_LIFE_ORB: MOD_1_30 - 1,
  FINAL_DMG_REDUCE_BERRY: MOD_0_50,
  FINAL_DOUBLE_DMG: MOD_2_00, // Earthquake -> Dig, Surf -> Dive, Stomp/Steamroller -> Minimize

  BP_TECHNICIAN: MOD_1_50,
  BP_FLAREBOOST: MOD_1_50,
  BP_ANALYTIC: MOD_1_30,
  BP_RECKLESS: MOD_1_20,
  BP_IRONFIST: MOD_1_20,
  BP_TOXICBOOST: MOD_1_50,
  BP_RIVALRY_SAME: MOD_1_25,
  BP_RIVALRY_OPPOSITE: MOD_0_75,
  BP_SAND_FORCE: MOD_1_30,
  BP_HEATPROOF: MOD_0_50,
  BP_DRY_SKIN: MOD_1_25,
  BP_SHEER_FORCE: MOD_1_30,

  BP_TYPE_BOOST: MOD_1_20,
  BP_MUSCLE_BAND: 0x1199,
  BP_WISE_GLASSES: 0x1199,
  BP_ORB: MOD_1_20,
  BP_GEM: MOD_1_50,

  BP_FACADE: MOD_2_00,
  BP_BRINE: MOD_2_00,
  BP_VENOSHOCK: MOD_2_00,
  BP_RETALIATE: MOD_2_00,
  BP_FUSION: MOD_2_00, // If move is either Fusion Bolt or Fusion Flare and the previously used move was respectively Fusion Flare or Fusion Bolt.
  BP_ME_FIRST: MOD_1_50,
  BP_SOLARBEAM_PENALTY: MOD_0_50,
  BP_CHARGE: MOD_2_00,
  BP_HELPINGHAND: MOD_1_50,
  BP_SPORT: 0x548, // ~0.33

  ATK_THICKFAT: MOD_0_50, // If target has ability Thick Fat and move is Ice or Fire type.

  ATK_TORRENT: MOD_1_50, // If user has ability Torrent, has MaxHP ÷ 3 or less HP and move is water type.
  ATK_SWARM: MOD_1_50, // If user has ability Swarm, has MaxHP ÷ 3 or less HP and move is bug type.
  ATK_OVERGROW: MOD_1_50, // If user has ability Overgrow, has MaxHP ÷ 3 or less HP and move is grass type.
  ATK_BLAZE: MOD_1_50, // If user has ability Blaze, has MaxHP ÷ 3 or less HP and move is fire type.
  ATK_PINCHBOOST: MOD_1_50,

  ATK_GUTS: MOD_1_50, // If user has ability Guts, has a status problem and move is physical.
  ATK_PLUS: MOD_1_50, // If user has ability Plus or Minus and an ally has ability Plus or Minus and move is special.
  ATK_DEFEATIST: MOD_0_50, // If user has ability Defeatist and CurrentHP ≤ MaxHP ÷ 2.
  ATK_PUREPOWER: MOD_2_00, // If user has ability Pure Power or Huge Power and move is physical.
  ATK_SOLARPOWER: MOD_1_50, // If user has ability Solar Power and weather is intense sunlight and move is special.
  /** DOES NOT CHAIN */
  ATK_HUSTLE: MOD_1_50, // If user has ability Hustle and move is physical. This is a special trigger in the sense that instead of chaining it will directly apply the 0x1800 on the current attack stat instead of being chained with others.
  ATK_FLASHFIRE: MOD_1_50, // If user has ability Flash Fire activated and move is Fire type.
  ATK_SLOWSTART: MOD_0_50, // If user has ability Slow Start, has been on field for less than 5 turns and move is physical.
  ATK_FLOWERGIFT: MOD_1_50, // If ally is Cherrim and has ability Flower Gift, weather is intense sunlight and move is physical.

  ATK_THICKCLUB: MOD_2_00, // If user is Cubone or Marowak, holds a Thick Club and move is physical.
  ATK_DEEPSEATOOTH: MOD_2_00, // If user is Clamperl, holds a DeepSeaTooth and move is special.
  ATK_LIGHTBALL: MOD_2_00, // If user is Pikachu and holds a Light Ball.
  ATK_SOULDEW: MOD_1_50, // If user is Latios or Latias, holds a Soul Dew and move is special.
  ATK_CHOICE: MOD_1_50, // If user is holding Choice Band and move is physical.

  DEF_SANDSTORM: MOD_1_50,

  DEF_MARVELSCALE: MOD_1_50, // If target has ability Marvel Scale, has a status problem and move is physical.
  DEF_FLOWERGIFT: MOD_1_50, // If ally is Cherrim and has ability Flower Gift, weather is intense sunlight and move is special.
  DEF_DEEPSEASCALE: MOD_1_50, // Is target is Clamperl, holds a DeepSeaScale and move is special.
  DEF_METALPOWDER: MOD_2_00, // Is target is (untransformed) Ditto, holds Metal Powder and move is physical.
  DEF_EVIOLITE: MOD_1_50, // If target is holding Eviolite and is not fully evolved.
  DEF_SOULDEW: MOD_1_50, // If target is Latios or Latias holding a Soul Dew and move is special.
};
