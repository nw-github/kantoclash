import type { ActivePokemon, BooleanFlag } from "./battle";
import type { MoveId } from "./moveList";
import { type Status } from "./pokemon";
import type { SpeciesId } from "./species";
import type { Stages } from "./utils";

export type BattleEvent =
    | SwitchEvent
    | DamageEvent
    | FailureEvent
    | UseMoveEvent
    | VictoryEvent
    | HitSubstituteEvent
    | StatusEvent
    | StagesEvent
    | InfoEvent
    | TransformEvent
    | DisableEvent
    | ChargeEvent;

export type PlayerId = string;

type SwitchEvent = {
    type: "switch";
    src: PlayerId;
    speciesId: SpeciesId;
    level: number;
    hp: number;
    maxHp: number;
    status: Status | null;
    name: string;
    indexInTeam: number;
};

export type DamageReason =
    | "attacked"
    | "substitute"
    | "recoil"
    | "drain"
    | "explosion"
    | "crash"
    | "ohko"
    | "recover"
    | "rest"
    | "seeded"
    | "seeder"
    | "psn"
    | "brn"
    | "confusion";

type DamageEvent = {
    type: "damage";
    src: PlayerId;
    target: PlayerId;
    hpBefore: number;
    hpAfter: number;
    maxHp: number;
    isCrit: boolean;
    why: DamageReason;
    eff?: number;
};

type HitSubstituteEvent = {
    type: "hit_sub";
    src: PlayerId;
    target: PlayerId;
    broken: boolean;
    confusion: boolean;
    eff?: number;
};

export type FailReason =
    | "immune"
    | "miss"
    | "generic"
    | "has_substitute"
    | "cant_substitute"
    | "flinch"
    | "mist"
    | "splash"
    | "whirlwind";

type FailureEvent = {
    type: "failed";
    src: PlayerId;
    why: FailReason;
};

type UseMoveEvent = {
    type: "move";
    src: PlayerId;
    move: MoveId;
    disabled?: true;
    thrashing?: true;
};

type VictoryEvent = {
    type: "victory";
    id: PlayerId;
};

type StatusEvent = {
    type: "status";
    id: PlayerId;
    status: Status;
    stats: ActivePokemon["stats"];
};

type StagesEvent = {
    type: "stages";
    id: PlayerId;
    stages: [Stages, number][];
    stats: ActivePokemon["stats"];
};

export type InfoReason =
    | BooleanFlag
    | "conversion"
    | "payday"
    | "seeded"
    | "became_confused"
    | "confused"
    | "confused_end"
    | "recharge"
    | "frozen"
    | "sleep"
    | "wake"
    | "haze"
    | "thaw"
    | "paralyze";

type InfoEvent = {
    type: "info";
    id: PlayerId;
    why: InfoReason;
};

type TransformEvent = {
    type: "transform";
    src: PlayerId;
    target: PlayerId;
};

type DisableEvent = {
    type: "disable";
    id: PlayerId;
    /** if move is present, the disable has started. otherwise, it has ended */
    move?: MoveId;
};

type ChargeEvent = {
    type: "charge";
    id: PlayerId;
    move: MoveId;
};
