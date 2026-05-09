import "./style.css";
import { io } from "socket.io-client";

const socket = io("http://2.27.29.74:3000");

const connectBtn = document.getElementById("connectBtn");
const localLevel = document.getElementById("localmic");
const remoteLevel = document.getElementById("remotemic");
const remoteAudio = document.getElementById("remoteAudio");

const res = await fetch("http://2.27.29.74:3000/api/ice-config");
const config = await res.json();


let localStream;
let peer;
let isInitiator = false;

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
  socket.emit("join-room", "test-room");
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

function createPeer() {
  peer = new RTCPeerConnection(config);

  // добавляем микрофон
  localStream.getTracks().forEach((track) => {
    peer.addTrack(track, localStream);
  });

  // получаем удалённый звук
  peer.ontrack = (event) => {
    console.log("REMOTE STREAM RECEIVED");
    const remoteStream = event.streams[0];
    remoteAudio.srcObject = remoteStream;
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play();
    visualizeAudio(remoteStream, remoteLevel);
  };

  // ICE кандидаты
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        room: "test-room",
        candidate: event.candidate,
      });
    }
  };
}

socket.on("created", () => {
  isInitiator = true;
  console.log("I am initiator");
});

socket.on("joined", () => {
  isInitiator = false;
  console.log("I am joiner");
});

socket.on("user-connected", async () => {
  if (!isInitiator) return;

  console.log("Creating offer");
  console.log("USER CONNECTED");
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  socket.emit("offer", {
    room: "test-room",
    offer,
  });
});

socket.on("offer", async (offer) => {
  console.log("OFFER RECEIVED");
  await peer.setRemoteDescription(offer);

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  socket.emit("answer", {
    room: "test-room",
    answer,
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
