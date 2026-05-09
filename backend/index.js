const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.send("backend is alive");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.get("/api/ice-config", (req, res) => {
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: process.env.TURN_URL,
        username: process.env.TURN_USER,
        credential: process.env.TURN_PASS
      }
    ]
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});


io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    const clients = io.sockets.adapter.rooms.get(roomId);

    const numClients = clients ? clients.size : 0;

    if (numClients >= 2) {
      socket.emit("room-full");
      return;
    }

    socket.join(roomId);

    console.log(`Room ${roomId}: ${numClients + 1} users`);

    if (numClients === 0) {
      socket.emit("created");
    } else {
      socket.emit("joined");
      socket.to(roomId).emit("user-connected");
    }
  });

  socket.on("offer", ({ room, offer }) => {
    if (!room || !offer) return;
    socket.to(room).emit("offer", offer);
  });

  socket.on("answer", ({ room, answer }) => {
    if (!room || !answer) return;
    socket.to(room).emit("answer", answer);
  });

  socket.on("ice-candidate", ({ room, candidate }) => {
    if (!room || !candidate) return;
    socket.to(room).emit("ice-candidate", candidate);
  });

  socket.on("disconnecting", () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit("user-disconnected");
    }
  });
});