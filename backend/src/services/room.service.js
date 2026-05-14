const rooms = require("../store/rooms.store"); // оставляем существующее хранилище

function createRoom(roomId, users, streams) {
  rooms.set(roomId, {
    users: users || [],
    streams: streams || {},
    createdAt: Date.now(),
  });
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function removeRoom(roomId) {
  rooms.delete(roomId);
}

function addUser(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.users.includes(socketId)) room.users.push(socketId);
}

function removeUser(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.users = room.users.filter(id => id !== socketId);
  if (room.users.length === 0) rooms.delete(roomId);
}

function findRoomBySocketId(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.includes(socketId)) {
      return { roomId, room };
    }
  }
  return null;
}

module.exports = {
  createRoom,
  getRoom,
  removeRoom,
  addUser,
  removeUser,
  findRoomBySocketId,
};
