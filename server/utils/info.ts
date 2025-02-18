type InfoChatMessage = {
  type: "chat";
  id?: string;
  message: string;
};

type InfoUserJoin = {
  type: "userJoin";
  id: string;
  name: string;
  isSpectator: boolean;
  nPokemon: number;
};

type InfoUserReconnect = {
  type: "userReconnect";
  id: string;
};

type InfoUserLeave = {
  type: "userLeave";
  id: string;
};

type InfoTimerStart = {
  type: "timerStart";
  id: string;
};

export type InfoMessage =
  | InfoChatMessage
  | InfoUserJoin
  | InfoUserReconnect
  | InfoUserLeave
  | InfoTimerStart;
