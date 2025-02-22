import { Server as Engine } from "engine.io";
import { defineEventHandler } from "h3";
import { GameServer } from "../utils/gameServer";
import { startBot } from "../bot";

export default defineNitroPlugin(nitro => {
  const engine = new Engine({ pingInterval: 5000, pingTimeout: 5000 });
  const io = new GameServer();
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

  console.log("initialized game server!");
  if (import.meta.dev) {
    startBot("randoms");
    startBot("randoms_nfe");
  }
});
