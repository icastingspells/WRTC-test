const rooms = require("../store/rooms.store");

function createRoom(roomId, users) {
  rooms.set(roomId, {
    users,
  });
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function removeRoom(roomId) {
  rooms.delete(roomId);
}

function findRoomBySocketId(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.includes(socketId)) {
      return {
        roomId,
        room,
      };
    }
  }

  return null;
}

module.exports = {
  createRoom,
  getRoom,
  removeRoom,
  findRoomBySocketId,
};
