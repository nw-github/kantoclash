import type {ValidatedPokemonDesc} from "~/game/pokemon";
import {moveList, type MoveId, type Move} from "~/game/moves";
import {speciesList, type Species, type SpeciesId} from "~/game/species";
import {statKeys, type Stats} from "~/game/utils";
import random from "random";
import {z} from "zod";
import {isValidSketchMove, type FormatId} from "~/utils/shared";
import {type Generation, GENERATION1} from "~/game/gen";
import {GENERATION2} from "~/game/gen2";
import {statusBerry, type ItemId} from "~/game/item";
import {itemDesc} from "~/utils";
import {profanityMatcher} from "~/utils/schema";

export type TeamProblems = {path: (string | number)[]; message: string}[];

interface FormatFunctions {
  generate?(): ValidatedPokemonDesc[];
  validate?(team: any): readonly [true, ValidatedPokemonDesc[]] | readonly [false, TeamProblems];
}

const speciesIds = Object.keys(speciesList) as SpeciesId[];

const badMoves = new Set<MoveId>(["struggle", "focusenergy", "payday", "absorb"]);

const uselessNfe = new Set<SpeciesId>(["weedle", "metapod", "kakuna", "magikarp", "caterpie"]);

const getRandomPokemon = (
  gen: Generation,
  count: number,
  validSpecies: (s: Species, id: SpeciesId) => boolean,
  customize: (s: Species, id: SpeciesId) => ValidatedPokemonDesc,
) => {
  return speciesIds
    .filter(id => gen.validSpecies(gen.speciesList[id]) && validSpecies(gen.speciesList[id], id))
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map(id => {
      const species = gen.speciesList[id];
      const poke = customize(species, id);
      const items = (Object.keys(gen.items) as ItemId[]).filter(item => {
        if (!(item in itemDesc)) {
          return false;
        } else if (
          (item === "metalpowder" && id !== "ditto") ||
          (item === "lightball" && id !== "pikachu") ||
          (item === "thickclub" && id !== "marowak") ||
          (item === "luckypunch" && id !== "chansey") ||
          (item === "stick" && id !== "farfetchd")
        ) {
          return false;
        } else if (
          (statusBerry[item] === "frz" && species.types.includes("ice")) ||
          (statusBerry[item] === "psn" && species.types.includes("psn")) ||
          (statusBerry[item] === "psn" && species.types.includes("steel")) ||
          (statusBerry[item] === "brn" && species.types.includes("fire"))
        ) {
          return false;
        } else if (item === "mysteryberry" && !poke.moves.some(m => gen.moveList[m].pp === 5)) {
          return false;
        }

        if (poke.moves[0] === "metronome" && poke.moves.length === 1) {
          return true;
        }

        const type = gen.itemTypeBoost[item];
        if (
          type &&
          !poke.moves.some(m => gen.moveList[m].kind === "damage" && gen.moveList[m].type === type)
        ) {
          return false;
        }

        return true;
      });
      poke.item = random.choice(items);
      poke.friendship = poke.moves.includes("frustration") ? 0 : 255;
      return poke;
    });
};

const getRandomMoves = (
  count: number,
  moves: readonly MoveId[],
  validMove: (m: Move, id: MoveId) => boolean,
) => {
  return moves
    .filter(id => validMove(moveList[id], id))
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
};

const isBadMove = (s: Species, move: Move, id: MoveId) => {
  const eva = ([stat, c]: [string, number]) =>
    (stat === "acc" && c < 0) || (stat === "eva" && c > 0);

  if (move.kind === "stage" && move.stages.some(eva)) {
    return true;
  }

  if (move.kind === "damage" && Array.isArray(move.effect?.[1]) && move.effect[1].some(eva)) {
    return true;
  }

  if (id === "attract" && s.genderRatio === undefined) {
    return true;
  }

  return badMoves.has(id) || move.kind === "fail";
};

export const randoms = (
  gen: Generation,
  validSpecies: (s: Species, id: SpeciesId) => boolean,
  level = 100,
) => {
  return getRandomPokemon(gen, 6, validSpecies, (s, id) => {
    let valid = s.moves;
    if (valid.includes("sketch")) {
      valid = Object.keys(gen.moveList).filter(id => isValidSketchMove(gen, id)) as MoveId[];
    }

    const moves = getRandomMoves(4, valid, (move, id) => !isBadMove(s, move, id));
    const stab = s.moves.filter(m => {
      const move = moveList[m];
      return (move.power ?? 0) > 40 && s.types.includes(move.type) && !moves.includes(m);
    });
    if (stab.length) {
      moves[0] = random.choice(stab)!;
    }
    const ivs: Partial<Stats> = {};
    if (moves.includes("hiddenpower")) {
      ivs.atk = 0b1100 | Math.floor(Math.random() * 4);
      ivs.def = 0b1100 | Math.floor(Math.random() * 4);
    }
    return {species: id, level, moves, ivs};
  });
};

const createValidator = (gen: Generation) => {
  return z
    .object({
      name: z
        .string()
        .trim()
        .max(24, "Name must be at most 24 characters")
        .refine(text => !profanityMatcher.hasMatch(text), "Name must not contain obscenities")
        .optional(),
      level: z.number().min(1).max(100).optional(),
      species: z.string().refine(s => s in gen.speciesList, "Species is invalid"),
      moves: z
        .string()
        .refine(m => m in gen.moveList, "Move does not exist")
        .array()
        .nonempty("Must have at least one move")
        .refine(arr => new Set(arr).size === arr.length, "Duplicate moves are not allowed"),
      ivs: z.record(z.enum(statKeys), z.number().min(0).max(gen.maxIv)).optional(),
      evs: z.record(z.enum(statKeys), z.number().min(0).max(gen.maxEv)).optional(),
      friendship: z.number().min(0).max(255).optional(),
      item: z
        .string()
        .refine(i => i in gen.items, "Item does not exist")
        .optional()
        .refine(i => gen.id !== 1 || !i, "Cannot have item in Gen 1"),
    })
    .superRefine((desc, ctx) => {
      const learnset = gen.speciesList[desc.species as SpeciesId]?.moves;
      if (!learnset) {
        return;
      }

      const sk = learnset.includes("sketch");
      for (let i = 0; i < desc.moves.length; i++) {
        if (!learnset.includes(desc.moves[i]) && (!sk || !isValidSketchMove(gen, desc.moves[i]))) {
          ctx.addIssue({path: ["moves", i], message: "Does not learn this move", code: "custom"});
        }
      }
    })
    .array()
    .max(6, "Team must have between 1 and 6 pokemon")
    .nonempty("Team must have between 1 and 6 pokemon")
    .refine(
      team => new Set(team.map(p => p.species)).size === team.length,
      "Cannot contain two pokemon of the same species",
    );
};

const VALIDATOR_GEN1 = createValidator(GENERATION1);
const VALIDATOR_GEN2 = createValidator(GENERATION2);

const validateTeam = (
  validator: typeof VALIDATOR_GEN1,
  team: any,
  onPoke?: (poke: ValidatedPokemonDesc, add: (s: string) => void) => void,
) => {
  const parsed = validator.safeParse(team);
  if (parsed.error) {
    return [false, parsed.error.issues] as const;
  }

  const problems: TeamProblems = [];
  for (const desc of parsed.data) {
    if (onPoke) {
      onPoke(desc as ValidatedPokemonDesc, message => problems.push({path: ["unknown"], message}));
    }
  }

  if (problems.length) {
    return [false, problems] as const;
  } else {
    return [true, parsed.data as ValidatedPokemonDesc[]] as const;
  }
};

export const formatDescs: Record<FormatId, FormatFunctions> = {
  g2_standard: {validate: team => validateTeam(VALIDATOR_GEN2, team)},
  g2_randoms: {
    generate: () => randoms(GENERATION2, (s, id) => !s.evolvesTo && id !== "mewtwo"),
  },
  g1_standard: {validate: team => validateTeam(VALIDATOR_GEN1, team)},
  g1_nfe: {
    validate(team) {
      return validateTeam(VALIDATOR_GEN1, team, (poke, addProblem) => {
        const species = GENERATION1.speciesList[poke.species];
        if (!species.evolvesTo) {
          addProblem(`'${species.name}' cannot be used in NFE format (it does not evolve)`);
        }
      });
    },
  },
  g1_truly_randoms: {
    generate() {
      return getRandomPokemon(
        GENERATION1,
        6,
        s => !s.evolvesTo,
        (s, species) => ({
          species,
          moves: getRandomMoves(
            4,
            Object.keys(moveList) as MoveId[],
            (move, id) => !isBadMove(s, move, id),
          ),
        }),
      );
    },
  },
  g1_randoms: {
    generate() {
      return randoms(GENERATION1, (s, id) => !s.evolvesTo && id !== "mewtwo");
    },
  },
  g1_randoms_nfe: {
    generate() {
      return randoms(GENERATION1, (s, id) => !!s.evolvesTo && !uselessNfe.has(id));
    },
  },
  g1_metronome: {
    generate() {
      return getRandomPokemon(
        GENERATION1,
        6,
        s => !s.evolvesTo,
        (_, species) => ({species, moves: ["metronome"]}),
      );
    },
  },
  g2_metronome: {
    generate() {
      return getRandomPokemon(
        GENERATION2,
        6,
        s => !s.evolvesTo,
        (_, species) => ({species, moves: ["metronome"]}),
      );
    },
  },
};
