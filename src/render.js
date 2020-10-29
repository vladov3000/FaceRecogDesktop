const { desktopCapturer, remote } = require("electron");

const { writeFile } = require("fs");

const { dialog, Menu } = remote;

// Global state
let mediaRecorder; // MediaRecorder instance to capture footage
const recordedChunks = [];
var canvas = document.querySelector("#videoCanvas");
var context = canvas.getContext("2d");
var boxes = [];
var xhr = null;
var curReqType = "boxes";
var matchIdx = 0;
var active = false;

var boxLineWidth = 6;
var bigFontSize = 40;
var fontSize = 40;
var padding = 10;

// Buttons
const videoElement = document.querySelector("video");
videoElement.onplay = function () {
  setTimeout(DrawVideo, 300);
};

const startBtn = document.getElementById("startBtn");
startBtn.onclick = (e) => {
  ratio = canvas.width / canvas.height;
  setup();
  active = true;
  mediaRecorder.start();
  startBtn.classList.add("is-danger");
  startBtn.innerText = "Recording";
};

const stopBtn = document.getElementById("stopBtn");

stopBtn.onclick = (e) => {
  boxes = [];
  active = false;
  mediaRecorder.stop();
  startBtn.classList.remove("is-danger");
  startBtn.innerText = "Start";
};

const videoSelectBtn = document.getElementById("videoSelectBtn");
videoSelectBtn.onclick = getVideoSources;

// Get the available video sources
async function getVideoSources() {
  const inputSources = await desktopCapturer.getSources({
    types: ["window", "screen"],
  });

  const videoOptionsMenu = Menu.buildFromTemplate(
    inputSources.map((source) => {
      return {
        label: source.name,
        click: () => selectSource(source),
      };
    })
  );

  videoOptionsMenu.popup();
}

// Change the videoSource window to record
async function selectSource(source) {
  videoSelectBtn.innerText = source.name;

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: source.id,
      },
    },
  };

  // Create a Stream
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  // Preview the source in a video element
  videoElement.srcObject = stream;
  videoElement.play();

  // Create the Media Recorder
  const options = { mimeType: "video/webm; codecs=vp9" };
  mediaRecorder = new MediaRecorder(stream, options);

  // Register Event Handlers
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.onstop = handleStop;

  // Updates the UI
}

function drawBoxes(toDraw) {
  toDraw.forEach((box) => {
    if (box.length == 0) return;
    context.beginPath();
    context.rect(box[3], box[0], box[1] - box[3], box[2] - box[0]);
    context.lineWidth = boxLineWidth;
    context.strokeStyle = "Lime";
    context.stroke();
    if (box.length > 4) {
      let info = box[4];
      let prev = drawEnclosedTextBox(info["Name"], box[0], box, bigFontSize);
      prev = drawEnclosedTextBox(info["Title"], prev, box, bigFontSize);
      for (key of Object.keys(info)) {
        if (key == "Name") continue;
        if (key == "Title") continue;
        prev = drawEnclosedTextBox(
          key + ": " + info[key],
          prev,
          box,
          fontSize,
          (color1 = "white"),
          (color2 = "black")
        );
        // console.log(key, info[key]);
      }
    }
  });
}

function drawEnclosedTextBox(
  text,
  top,
  box,
  size,
  color1 = "black",
  color2 = "white"
) {
  context.beginPath();
  context.rect(
    box[1],
    top,
    (text.length * size) / 2 + padding * 2 + boxLineWidth,
    size + padding * 2
  );
  context.fillStyle = color1;
  context.fill();

  context.beginPath();
  context.font = size + "px Arial";
  context.fillStyle = color2;
  context.fillText(text, box[1] + padding, top + size);

  return top + size + padding * 2;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setup() {
  console.log("Sending new boxes request...");

  var xhr = getData("boxes", getFrame().replace("data:image/png;base64,", ""));
  xhr.onreadystatechange = () => {
    if (xhr.readyState == XMLHttpRequest.DONE) {
      console.log(xhr.responseText);
      boxes = JSON.parse(xhr.responseText)["face_locations"];
    }
  };

  while (xhr.readyState != XMLHttpRequest.DONE) {
    console.log("Waiting for boxes request to finish...");
    await sleep(5000);
  }

  for (i = 0; i < boxes.length; i++) {
    getMatch(i);
  }

  console.log(boxes);
}

async function getMatch(idx) {
  let box = boxes[idx];
  dataURL = getFrame(box[3], box[0], box[1] - box[3], box[2] - box[0]).replace(
    "data:image/png;base64,",
    ""
  );
  xhr = getData("match", dataURL);
  xhr.onreadystatechange = () => {
    if (xhr.readyState == XMLHttpRequest.DONE) {
      console.log(xhr.responseText);
      boxes[idx].push(JSON.parse(xhr.responseText));
    }
  };

  while (xhr.readyState != XMLHttpRequest.DONE) {
    console.log("Waiting for match request to finish...");
    await sleep(5000);
  }
}

function getData(endpoint, dataURL) {
  xhr = new XMLHttpRequest();
  xhr.open("POST", "http://localhost:8080/" + endpoint, true);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr.send(dataURL);
  return xhr;
}

function sendFrame() {
  if (!active) return;

  var dataURL;
  if (xhr == null || xhr.readyState == XMLHttpRequest.DONE) {
    if (xhr != null) {
      console.log(JSON.parse(xhr.responseText));
      if (curReqType == "boxes" || boxes === []) {
        boxes = JSON.parse(xhr.responseText)["face_locations"];
        curReqType = "match";
        matchIdx = boxes.length - 1;
        dataURL = getFrame().replace("data:image/png;base64,", "");
      } else if (curReqType == "match") {
        if (matchIdx > boxes.length - 1) matchIdx = boxes.length - 1;
        while (matchIdx > -1 && boxes[matchIdx].length > 4) matchIdx--;
        if (matchIdx == -1) return;
        boxes[matchIdx].push(JSON.parse(xhr.responseText));
        console.log(boxes[matchIdx][5]);
        let box = boxes[matchIdx];
        dataURL = getFrame(
          box[3],
          box[0],
          box[1] - box[3],
          box[2] - box[0]
        ).replace("data:image/png;base64,", "");
        matchIdx--;
        if (matchIdx == -1) curReqType = "boxes";
      }
    } else {
      dataURL = getFrame().replace("data:image/png;base64,", "");
    }
    console.log("Sending new " + curReqType + " request...");
    xhr = new XMLHttpRequest();

    xhr.open("POST", "http://localhost:8080/" + curReqType, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.send(dataURL);
  }
}

// setInterval(sendFrame, 3000);

// Get one frame from the video
function getFrame(
  topx = 0,
  topy = 0,
  w = videoElement.width,
  h = videoElement.height,
  addToBody = false
) {
  //generate frame URL data
  context.drawImage(videoElement, topx, topy, w, h);
  var dataURL = canvas.toDataURL();

  if (addToBody) {
    //create img
    let img = document.createElement("img");
    img.setAttribute("src", dataURL);

    //append img in container div
    document.body.appendChild(img);
  }

  return dataURL;
}

function DrawVideo() {
  canvas.width = window.innerWidth; //videoElement.videoWidth;
  canvas.height = window.innerHeight; //videoElement.videoHeight;

  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  if (boxes.length > 0) drawBoxes(boxes);

  setTimeout(DrawVideo, 1);
}

// Captures all recorded chunks
function handleDataAvailable(e) {
  return;

  console.log("video data available");
  recordedChunks.push(e.data);
  getFrame(true);
  sendFrame();
}

// Saves the video file on stop
async function handleStop(e) {
  return;

  const blob = new Blob(recordedChunks, {
    type: "video/webm; codecs=vp9",
  });

  const buffer = Buffer.from(await blob.arrayBuffer());

  const { filePath } = await dialog.showSaveDialog({
    buttonLabel: "Save video",
    defaultPath: `vid-${Date.now()}.webm`,
  });

  if (filePath) {
    writeFile(filePath, buffer, () => console.log("video saved successfully!"));
  }
}
