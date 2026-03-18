type InfoChatMessage = {type: "chat"; id: string; message: string};

type InfoUserJoin = {
  type: "userJoin";
  id: string;
  name: string;
  isSpectator: bool;
  nPokemon: number;
  admin: bool | undefined;
};

type InfoUserLeave = {type: "userLeave"; id: string};

type InfoTimerStart = {type: "timerStart"; id: string; info: BattleTimers};

export type InfoMessage = InfoChatMessage | InfoUserJoin | InfoUserLeave | InfoTimerStart;
export type BattleTimers = Record<string, {startedAt: number; duration: number}>;
