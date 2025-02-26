import { Pokemon } from "../game/pokemon";
import { moveList, type MoveId } from "../game/moveList";
import { speciesList, type Species, type SpeciesId } from "../game/species";
import { AlwaysFailMove, type Move } from "../game/moves";
import random from "random";
import { statKeys } from "~/game/utils";
import { z } from "zod";

export const battleFormats = [
  "standard",
  "nfe",
  "randoms",
  "randoms_nfe",
  "truly_randoms",
  "metronome",
] as const;

export type FormatId = (typeof battleFormats)[number];

export type TeamProblems = { path: (string | number)[]; message: string }[];

type FormatDesc = {
  chooseLead?: boolean;
  generate?(): Pokemon[];
  validate?(team: any): readonly [true, Pokemon[]] | readonly [false, TeamProblems];
};

const speciesIds = Object.keys(speciesList) as SpeciesId[];

const badMoves = new Set<MoveId>(["struggle", "focusenergy", "payday", "absorb", "focusenergy"]);

const uselessNfe = new Set<SpeciesId>(["weedle", "metapod", "kakuna", "magikarp", "caterpie"]);

const getRandomPokemon = (
  count: number,
  validSpecies: (s: Species, id: SpeciesId) => boolean,
  customize: (s: Species, id: SpeciesId) => Pokemon,
) => {
  return speciesIds
    .filter(id => validSpecies(speciesList[id], id))
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map(id => customize(speciesList[id], id));
};

const getRandomMoves = (
  count: number,
  moves: MoveId[],
  validMove: (m: Move, id: MoveId) => boolean,
) => {
  return moves
    .filter(id => validMove(moveList[id], id))
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
};

const isBadMove = (move: Move, id: MoveId) => {
  return badMoves.has(id) || move instanceof AlwaysFailMove;
};

export const randoms = (validSpecies: (s: Species, id: SpeciesId) => boolean, level = 100) => {
  return getRandomPokemon(6, validSpecies, (s, id) => {
    const moves = getRandomMoves(4, s.moves, (move, id) => !isBadMove(move, id));
    const stab = s.moves.filter(m => {
      const move = moveList[m];
      return (move.power ?? 0) > 40 && s.types.includes(move.type) && !moves.includes(m);
    });
    if (stab.length) {
      moves[0] = random.choice(stab)!;
    }
    return new Pokemon(id, {}, {}, level, moves);
  });
};

const teamValidator = z
  .object({
    name: z.string().trim().max(24).optional(),
    level: z.number().min(0).max(100),
    species: z.string().refine(s => (speciesList as any)[s] !== undefined, "Species is invalid"),
    moves: z
      .string()
      .refine(m => (moveList as any)[m] !== undefined, "Move does not exist")
      .array()
      .nonempty()
      .refine(arr => new Set(arr).size === arr.length, "Duplicate moves are not allowed"),
    dvs: z.record(z.enum(statKeys), z.number().min(0).max(15)),
    statexp: z.record(z.enum(statKeys), z.number().min(0).max(65535)),
  })
  .superRefine((desc, ctx) => {
    const learnset = speciesList[desc.species as SpeciesId]?.moves as MoveId[];
    if (!learnset) {
      return;
    }

    for (let i = 0; i < desc.moves.length; i++) {
      if (!learnset.includes(desc.moves[i] as MoveId)) {
        ctx.addIssue({ path: ["moves", i], message: "Does not learn this move", code: "custom" });
      }
    }
  })
  .array()
  .max(6)
  .nonempty("Team must have between 1 and 6 pokemon")
  .refine(
    team => new Set(team.map(p => p.species)).size === team.length,
    "Cannot contain two pokemon of the same species",
  );

const validateTeam = (team: any, onPoke?: (poke: Pokemon, add: (s: string) => void) => void) => {
  const parsed = teamValidator.safeParse(team);
  if (parsed.error) {
    return [false, parsed.error.issues] as const;
  }

  const result = [];
  const problems: TeamProblems = [];
  for (const desc of parsed.data) {
    result.push(Pokemon.fromDescriptor(desc as Gen1PokemonDesc));
    if (onPoke) {
      onPoke(result.at(-1)!, message => problems.push({ path: ["unknown"], message }));
    }
  }

  if (problems.length) {
    return [false, problems] as const;
  } else {
    return [true, result] as const;
  }
};

export const formatDescs: Record<FormatId, FormatDesc> = {
  standard: {
    chooseLead: true,
    validate(team) {
      return validateTeam(team);
    },
  },
  nfe: {
    chooseLead: true,
    validate(team) {
      return validateTeam(team, (poke, addProblem) => {
        if (!poke.species.evolves) {
          addProblem(`'${poke.species.name}' cannot be used in NFE format (it does not evolve)`);
        }
      });
    },
  },
  truly_randoms: {
    generate() {
      return getRandomPokemon(
        6,
        s => !s.evolves,
        (_, id) =>
          new Pokemon(
            id,
            {},
            {},
            100,
            getRandomMoves(
              4,
              Object.keys(moveList) as MoveId[],
              (move, id) => !isBadMove(move, id),
            ),
          ),
      );
    },
  },
  randoms: {
    generate() {
      return randoms(s => !s.evolves);
    },
  },
  randoms_nfe: {
    generate() {
      return randoms((s, id) => s.evolves && !uselessNfe.has(id));
    },
  },
  metronome: {
    generate() {
      return getRandomPokemon(
        6,
        s => !s.evolves,
        (_, id) => new Pokemon(id, {}, {}, 100, ["metronome"]),
      );
    },
  },
};
