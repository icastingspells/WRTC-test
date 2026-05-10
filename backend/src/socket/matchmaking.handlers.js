const crypto = require("crypto");

const {
  addToQueue,
  removeFromQueue,
  getNextUser,
  hasUsersInQueue,
} = require("../services/queue.service");

const {
  createRoom,
  findRoomBySocketId,
  removeRoom,
} = require("../services/room.service");

module.exports = (io, socket) => {
  socket.on("find-partner", () => {
    removeFromQueue(socket.id);

    const existingRoom = findRoomBySocketId(socket.id);

    if (existingRoom) {
      return;
    }

    if (hasUsersInQueue()) {
      const partnerId = getNextUser();

      if (partnerId === socket.id) {
        addToQueue(socket.id);
        return;
      }

      const partnerSocket = io.sockets.sockets.get(partnerId);

      if (!partnerSocket) {
        addToQueue(socket.id);
        return;
      }

      const roomId = crypto.randomUUID();

      createRoom(roomId, [socket.id, partnerId]);

      socket.join(roomId);
      partnerSocket.join(roomId);

      socket.data.roomId = roomId;
      partnerSocket.data.roomId = roomId;

      // initiator
      partnerSocket.emit("matched", {
        roomId,
        initiator: true,
      });

      socket.emit("matched", {
        roomId,
        initiator: false,
      });

      console.log(`Match created: ${roomId}`);
    } else {
      addToQueue(socket.id);

      socket.emit("waiting");
    }
  });

  socket.on("next", () => {
    leaveCurrentRoom(io, socket);

    socket.emit("searching");

    socket.emit("find-again");
  });

  socket.on("leave-room", () => {
    removeFromQueue(socket.id);

    leaveCurrentRoom(io, socket);
  });
};

function leaveCurrentRoom(io, socket) {
  const roomData = findRoomBySocketId(socket.id);

  if (!roomData) {
    return;
  }

  const { roomId, room } = roomData;

  const partnerId = room.users.find((id) => id !== socket.id);

  if (partnerId) {
    const partnerSocket = io.sockets.sockets.get(partnerId);

    if (partnerSocket) {
      partnerSocket.leave(roomId);

      partnerSocket.data.roomId = null;

      partnerSocket.emit("partner-disconnected");

      addToQueue(partnerId);
    }
  }

  socket.leave(roomId);

  socket.data.roomId = null;

  removeRoom(roomId);

  console.log(`Room removed: ${roomId}`);
}
