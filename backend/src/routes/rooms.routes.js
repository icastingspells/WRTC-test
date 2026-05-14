const express = require("express");
const { v4: uuidv4 } = require("uuid");
const roomService = require("../services/room.service");

const router = express.Router();

router.post("/room", (req, res) => {
  const roomId = uuidv4();
  roomService.createRoom(roomId, []);
  res.json({ roomId, url: `${req.protocol}://${req.get("host")}/room/${roomId}` });
});

router.get("/room/:roomId", (req, res) => {
  const room = roomService.getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: "not_found" });
  res.json({ roomId: req.params.roomId, users: room.users });
});

module.exports = router;