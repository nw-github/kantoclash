import { Server as Engine } from "engine.io";
import { defineEventHandler } from "h3";
import { GameServer } from "../gameServer";
import { rankBot, startBot } from "../bot";
import { battles } from "../db/schema";

export default defineNitroPlugin(nitro => {
  const engine = new Engine({ pingInterval: 5000, pingTimeout: 5000 });
  const io = new GameServer(undefined, {
    async onBattleComplete(format, battle) {
      const battlers = battle.players.map(pl => pl.id);
      await useDrizzle()
        .insert(battles)
        .values({
          format,
          player1: +battlers[0],
          player2: +battlers[1],
          winner: battle.victor ? +battle.victor.id : null,
        });
    },
  });
  io.bind(engine);

  nitro.router.use(
    "/socket.io/",
    defineEventHandler({
      async handler(event) {
        // smuggle the user info to the socket io handler, where it can be accessed in GameServer
        // through socket.request

        // @ts-expect-error property __SOCKETIO_USER__ does not exist
        event.node.req.__SOCKETIO_USER__ = (await getUserSession(event)).user;

        // @ts-expect-error argument is not assignable
        engine.handleRequest(event.node.req, event.node.res);
        event._handled = true;
      },
      websocket: {
        open(peer) {
          // @ts-expect-error private method and property
          const { nodeReq } = peer._internal;
          // @ts-expect-error private method and property
          engine.prepare(nodeReq);
          // @ts-expect-error private method and property
          engine.onWebSocket(nodeReq, nodeReq.socket, peer.websocket);
        },
      },
    }),
  );

  console.log("initialized game server on port " + process.env.PORT || 3000);
  startBot().then(() => startBot(undefined, rankBot));
});
