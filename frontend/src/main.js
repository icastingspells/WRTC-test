import "./style.css";
import { io } from "socket.io-client";

const socket = io();

const connectBtn = document.getElementById("connectBtn");
const localLevel = document.getElementById("localmic");
const remoteLevel = document.getElementById("remotemic");
const remoteAudio = document.getElementById("remoteAudio");
const nextBtn = document.getElementById("nextBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const res = await fetch("/api/ice-config");
const config = await res.json();


let localStream;
let peer;
let currentRoomId = null;
let isInitiator = false;


// Получаем доступ к микрофону и подключаемся к комнате
connectBtn.addEventListener("click", async () => {
   localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  visualizeAudio(localStream, localLevel);
  createPeer();
  socket.emit("find-partner");
});

connectBtn.addEventListener("click", async () => {
    socket.emit("disconnect");
});


// WebRTC peer connection setup
function createPeer() {
  peer = new RTCPeerConnection(config);

  // добавляем микрофон
  localStream.getTracks().forEach((track) => {
    peer.addTrack(track, localStream);
  });

  // получаем удалённый звук
  peer.ontrack = (event) => {
    const remoteStream = event.streams[0];
    remoteAudio.srcObject = remoteStream;
    remoteAudio.play();
    visualizeAudio(remoteStream, remoteLevel);
  };

  // ICE кандидаты
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        roomId: currentRoomId,
        candidate: event.candidate,
      });
    }
  };
}


socket.on("waiting", () => {
  console.log("Waiting for partner...");
  nextBtn.enabled = false;
});

socket.on("matched", async ({ roomId, initiator }) => {
  console.log("MATCHED");
  currentRoomId = roomId;
  createPeer();
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "block";
  nextBtn.style.display = "block";
  nextBtn.enabled = true;

  if (initiator) {

    const offer = await peer.createOffer();

    await peer.setLocalDescription(offer);

    socket.emit("offer", {
      roomId,
      offer
    });
  }
});

socket.on("offer", async (offer) => {

  console.log("OFFER RECEIVED");

  await peer.setRemoteDescription(offer);

  const answer = await peer.createAnswer();

  await peer.setLocalDescription(answer);

  socket.emit("answer", {
    roomId: currentRoomId,
    answer
  });
});

socket.on("answer", async (answer) => {

  console.log("ANSWER RECEIVED");

  await peer.setRemoteDescription(answer);
});

socket.on("ice-candidate", async (candidate) => {

  try {

    await peer.addIceCandidate(candidate);

  } catch (e) {

    console.error("ICE ERROR", e);
  }
});

socket.on("partner-disconnected", () => {

  console.log("Partner disconnected");

  if (peer) {
    peer.close();
    peer = null;
  }

  currentRoomId = null;
  disconnectBtn.style.display = "none";
});

nextBtn.addEventListener("click", () => {

  if (peer) {
    peer.close();
    peer = null;
  }

  currentRoomId = null;

  socket.emit("next");
});


socket.on("find-again", () => {

  socket.emit("find-partner");
});

// визуализация уровня звука
function visualizeAudio(stream, element) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  function update() {
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;

    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    element.style.width = `${average}%`;
    requestAnimationFrame(update);
  }
  update();
}