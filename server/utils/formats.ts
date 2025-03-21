import type {ValidatedPokemonDesc} from "~/game/pokemon";
import {moveList, type MoveId, type Move} from "~/game/moves";
import {speciesList, type Species, type SpeciesId} from "~/game/species";
import {statKeys} from "~/game/utils";
import random from "random";
import {z} from "zod";
import type {FormatId} from "~/utils/shared";
import {type Generation, GENERATION1} from "~/game/gen";
import {GENERATION2} from "~/game/gen2";

export type TeamProblems = {path: (string | number)[]; message: string}[];

interface FormatFunctions {
  generate?(): ValidatedPokemonDesc[];
  validate?(team: any): readonly [true, ValidatedPokemonDesc[]] | readonly [false, TeamProblems];
}

const speciesIds = Object.keys(speciesList) as SpeciesId[];

const badMoves = new Set<MoveId>(["struggle", "focusenergy", "payday", "absorb", "focusenergy"]);

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
    .map(id => customize(gen.speciesList[id], id));
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

const isBadMove = (move: Move, id: MoveId) => {
  if (
    move.kind === "stage" &&
    move.stages.some(stages => stages[0] === "acc" || stages[0] === "eva")
  ) {
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
    const moves = getRandomMoves(4, s.moves, (move, id) => !isBadMove(move, id));
    const stab = s.moves.filter(m => {
      const move = moveList[m];
      return (move.power ?? 0) > 40 && s.types.includes(move.type) && !moves.includes(m);
    });
    if (stab.length) {
      moves[0] = random.choice(stab)!;
    }
    return {species: id, level, moves};
  });
};

const createValidator = (gen: Generation) => {
  return z
    .object({
      name: z.string().trim().max(24, "Name must be at most 24 characters").optional(),
      level: z.number().min(1).max(100).optional(),
      species: z
        .string()
        .refine(s => (gen.speciesList as any)[s] !== undefined, "Species is invalid"),
      moves: z
        .string()
        .refine(m => (gen.moveList as any)[m] !== undefined, "Move does not exist")
        .array()
        .nonempty("Must have at least one move")
        .refine(arr => new Set(arr).size === arr.length, "Duplicate moves are not allowed"),
      ivs: z.record(z.enum(statKeys), z.number().min(0).max(15)).optional(),
      evs: z.record(z.enum(statKeys), z.number().min(0).max(65535)).optional(),
      friendship: z.number().min(0).max(255).optional(),
    })
    .superRefine((desc, ctx) => {
      const learnset = gen.speciesList[desc.species as SpeciesId]?.moves;
      if (!learnset) {
        return;
      }

      for (let i = 0; i < desc.moves.length; i++) {
        if (!learnset.includes(desc.moves[i])) {
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
        (_, species) => ({
          species,
          moves: getRandomMoves(
            4,
            Object.keys(moveList) as MoveId[],
            (move, id) => !isBadMove(move, id),
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
