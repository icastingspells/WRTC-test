const { Server } = require("socket.io");

const registerRoomHandlers = require("./room.handlers");
const registerMatchmakingHandlers = require("./matchmaking.handlers");

module.exports = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*"
    }
  });

  io.on("connection", (socket) => {

    console.log("Connected:", socket.id);

    registerRoomHandlers(io, socket);

    registerMatchmakingHandlers(io, socket);
  });
};