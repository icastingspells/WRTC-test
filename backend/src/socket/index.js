const { Server } = require("socket.io");
const mediasoup = require("mediasoup");
const { v4: uuidv4 } = require("uuid");
const roomService = require("../services/room.service");


const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
];

let workerPromise = null;
let worker = null;

function ensureWorker() {
  if (!workerPromise) {
    workerPromise = mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 20000,
      rtcMaxPort: 20200,
    }).then(w => {
      worker = w;
      worker.on("died", () => {
        console.error("mediasoup worker died, exiting.");
        process.exit(1);
      });
      return w;
    });
  }
  return workerPromise;
}


const rooms = new Map();


function transportToClient(transport) {
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

module.exports = function initSocket(server) {

  ensureWorker();

  const io = new Server(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("socket connected", socket.id);

    socket.on("create-room", async (data, cb) => {
      await ensureWorker();
      const roomId = uuidv4();
      const router = await worker.createRouter({ mediaCodecs });
      rooms.set(roomId, { router, peers: new Map(), producers: new Map() });
      roomService.createRoom(roomId, []);
      if (cb) cb({ roomId });
    });

    socket.on("join-room", async ({ roomId }, cb) => {
      await ensureWorker();
      if (!rooms.has(roomId)) {
        const router = await worker.createRouter({ mediaCodecs });
        rooms.set(roomId, { router, peers: new Map(), producers: new Map() });
        roomService.createRoom(roomId, []);
      }
      const room = rooms.get(roomId);
      socket.join(roomId);

      // register user in service
      const r = roomService.getRoom(roomId);
      if (r) {
        if (!Array.isArray(r.users)) r.users = [];
        if (!r.users.includes(socket.id)) r.users.push(socket.id);
      }

      // send router capabilities and existing producer ids
      const producerList = Array.from(room.producers.keys()).map((id) => ({
        id,
        socketId: room.producers.get(id).socketId,
      }));

      if (cb) cb({ rtpCapabilities: room.router.rtpCapabilities, producers: producerList });
    });


    socket.on("createWebRtcTransport", async ({ roomId }, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb({ error: "room-not-found" });
      const router = room.router;
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });
      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") transport.close();
      });

      // store transport under peer
      let peer = room.peers.get(socket.id);
      if (!peer) {
        peer = { transports: new Map(), producers: new Map(), consumers: new Map() };
        room.peers.set(socket.id, peer);
      }
      peer.transports.set(transport.id, transport);

      cb({ params: transportToClient(transport) });
    });

    socket.on("connect-transport", async ({ roomId, transportId, dtlsParameters }, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb({ error: "room-not-found" });
      const peer = room.peers.get(socket.id);
      if (!peer) return cb({ error: "peer-not-found" });
      const transport = peer.transports.get(transportId);
      if (!transport) return cb({ error: "transport-not-found" });
      await transport.connect({ dtlsParameters });
      cb({ ok: true });
    });

    socket.on("produce", async ({ roomId, transportId, kind, rtpParameters }, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb({ error: "room-not-found" });
      const peer = room.peers.get(socket.id);
      if (!peer) return cb({ error: "peer-not-found" });
      const transport = peer.transports.get(transportId);
      if (!transport) return cb({ error: "transport-not-found" });

      const producer = await transport.produce({ kind, rtpParameters });
      room.producers.set(producer.id, { producer, socketId: socket.id });
      peer.producers.set(producer.id, producer);

      // notify other peers to consume this producer
      socket.to(roomId).emit("new-producer", { producerId: producer.id, socketId: socket.id, kind });
      cb({ id: producer.id });
    });

    socket.on("consume", async ({ roomId, producerId, rtpCapabilities }, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb({ error: "room-not-found" });
      const router = room.router;

      if (!router.canConsume({ producerId, rtpCapabilities })) {
        return cb({ error: "cannot-consume" });
      }

      let peer = room.peers.get(socket.id);
      if (!peer) {
        peer = { transports: new Map(), producers: new Map(), consumers: new Map() };
        room.peers.set(socket.id, peer);
      }

      // pick a transport for consuming (we reuse any existing transport)
      let recvTransport = null;
      for (const t of peer.transports.values()) { recvTransport = t; break; }
      if (!recvTransport) {
        recvTransport = await router.createWebRtcTransport({
          listenIps: [{ ip: "0.0.0.0", announcedIp: null }],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
        });
        peer.transports.set(recvTransport.id, recvTransport);
      }

      const consumer = await recvTransport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      peer.consumers.set(consumer.id, consumer);

      cb({
        params: {
          id: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
        transportId: recvTransport.id,
      });
    });

    socket.on("consumer-resume", async ({ roomId, consumerId }, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb({ error: "room-not-found" });
      const peer = room.peers.get(socket.id);
      if (!peer) return cb({ error: "peer-not-found" });
      const consumer = peer.consumers.get(consumerId);
      if (!consumer) return cb({ error: "consumer-not-found" });
      await consumer.resume();
      cb({ ok: true });
    });

    async function cleanupPeerFromRooms(socketId) {
      for (const [roomId, room] of rooms) {
        if (!room.peers.has(socketId)) continue;
        const peer = room.peers.get(socketId);
        // close producers
        for (const prod of peer.producers.values()) {
          try { prod.close(); } catch (e) {}
          room.producers.delete(prod.id);
        }
        // close consumers
        for (const cons of peer.consumers.values()) {
          try { cons.close(); } catch (e) {}
        }
        // close transports
        for (const tr of peer.transports.values()) {
          try { tr.close(); } catch (e) {}
        }
        room.peers.delete(socketId);

        // update roomService users
        const r = roomService.getRoom(roomId);
        if (r) r.users = r.users.filter(id => id !== socketId);

        socket.to(roomId).emit("peer-left", { socketId });

        // if room empty => close router and remove
        if (room.peers.size === 0) {
          try { room.router.close(); } catch (e) {}
          rooms.delete(roomId);
          roomService.removeRoom(roomId);
        }
      }
    }

    socket.on("leave-room", async ({ roomId }, cb) => {
      await cleanupPeerFromRooms(socket.id);
      socket.leave(roomId);
      if (cb) cb({ ok: true });
    });

    socket.on("disconnect", async () => {
      await cleanupPeerFromRooms(socket.id);
    });

  });



};
