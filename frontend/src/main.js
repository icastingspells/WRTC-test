import "./style.css";
import { io } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

const socket = io();

const createBtn = document.getElementById("createRoomBtn");
const copyBtn = document.getElementById("copyLinkBtn");
const remoteContainer = document.getElementById("remoteContainer");
const localLevel = document.getElementById("localmic");

let device;
let sendTransport;
let recvTransport;
let producer;
let localStream;
const consumers = new Map();
let currentRoomId = null;

// Create room via API, push URL, then join
createBtn?.addEventListener("click", async () => {
  const res = await fetch("/api/room", { method: "POST" });
  const data = await res.json();
  const roomId = data.roomId;
  history.pushState({}, "", `/room/${roomId}`);
  await joinRoom(roomId);
});

// Copy link
copyBtn?.addEventListener("click", () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url);
});

// On page load if URL contains /room/:id -> show join button or auto-join
(async function autoJoin() {
  const path = window.location.pathname;
  const match = path.match(/\/room\/(.+)$/);
  if (match) {
    const roomId = match[1];
    // show a join button or auto-join:
    // await joinRoom(roomId);
  }
})();

async function joinRoom(roomId) {
  currentRoomId = roomId;
  // 1) get router rtpCapabilities + existing producers
  const joinResp = await new Promise((resolve) => {
    socket.emit("join-room", { roomId }, resolve);
  });

  const { rtpCapabilities, producers } = joinResp;
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });

  // 2) create send transport on server & device
  const sendParams = await new Promise((resolve) => {
    socket.emit("createWebRtcTransport", { roomId }, resolve);
  });
  sendTransport = device.createSendTransport(sendParams.params);
  sendTransport.on("connect", ({ dtlsParameters }, cb, err) => {
    socket.emit("connect-transport", { roomId, transportId: sendTransport.id, dtlsParameters }, (res) => {
      if (res?.error) return err(res.error);
      cb();
    });
  });
  sendTransport.on("produce", async ({ kind, rtpParameters }, cb, err) => {
    socket.emit("produce", { roomId, transportId: sendTransport.id, kind, rtpParameters }, (res) => {
      if (res?.error) return err(res.error);
      cb({ id: res.id });
    });
  });

  // 3) create recv transport
  const recvParams = await new Promise((resolve) => {
    socket.emit("createWebRtcTransport", { roomId }, resolve);
  });
  recvTransport = device.createRecvTransport(recvParams.params);
  recvTransport.on("connect", ({ dtlsParameters }, cb, err) => {
    socket.emit("connect-transport", { roomId, transportId: recvTransport.id, dtlsParameters }, (res) => {
      if (res?.error) return err(res.error);
      cb();
    });
  });

  // 4) get local audio and produce
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    visualizeAudio(localStream, localLevel);
    producer = await sendTransport.produce({ track: localStream.getAudioTracks()[0] });
  } catch (e) {
    console.error("getUserMedia/produce error", e);
    return;
  }

  // 5) consume existing producers
  for (const p of producers) {
    await consumeProducer(roomId, p.id);
  }

  // 6) listen for new producers
  socket.on("new-producer", async ({ producerId }) => {
    await consumeProducer(roomId, producerId);
  });

  socket.on("peer-left", ({ socketId }) => {
    // remove related audio elements if needed
  });
}

async function consumeProducer(roomId, producerId) {
  // request server to create consumer (server will create paused consumer and return params)
  const res = await new Promise((resolve) => {
    socket.emit("consume", { roomId, producerId, rtpCapabilities: device.rtpCapabilities }, resolve);
  });
  if (res?.error) {
    console.warn("cannot consume", res);
    return;
  }
  const { params } = res;
  const consumer = await recvTransport.consume(params);
  const stream = new MediaStream();
  stream.addTrack(consumer.track);

  const audioEl = document.createElement("audio");
  audioEl.srcObject = stream;
  audioEl.autoplay = true;
  audioEl.controls = false;
  remoteContainer?.appendChild(audioEl);

  consumers.set(consumer.id, { consumer, el: audioEl });

  // resume on server
  await new Promise((resolve) => {
    socket.emit("consumer-resume", { roomId, consumerId: consumer.id }, resolve);
  });
}

function visualizeAudio(stream, element) {
  if (!stream || !element) return;
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  function update() {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const average = sum / dataArray.length;
    element.style.width = `${Math.min(100, average)}%`;
    requestAnimationFrame(update);
  }
  update();
}