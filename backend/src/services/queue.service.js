const queue = require("../store/queue.store");

function addToQueue(socketId) {
  if (!queue.includes(socketId)) {
    queue.push(socketId);
  }
}

function removeFromQueue(socketId) {
  const index = queue.indexOf(socketId);

  if (index !== -1) {
    queue.splice(index, 1);
  }
}

function getNextUser() {
  return queue.shift();
}

function hasUsersInQueue() {
  return queue.length > 0;
}

module.exports = {
  addToQueue,
  removeFromQueue,
  getNextUser,
  hasUsersInQueue,
};
