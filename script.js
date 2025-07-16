const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const laneCount = 4;
const laneWidth = canvas.width / laneCount;
const noteSpeed = 400;
const hitLineY = canvas.height - 100;

let notes = [];
let startTime = null;

let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
let offset = 0;

const pressedKeys = new Set();

document.addEventListener("keydown", e => pressedKeys.add(e.key));
document.addEventListener("keyup", e => pressedKeys.delete(e.key));

function keyToLane(key) {
  switch (key) {
    case "d": return 0;
    case "f": return 1;
    case "j": return 2;
    case "k": return 3;
    default: return null;
  }
}

function beatmaniaLaneIndex(lane) {
  const map = {
    "-1.5": 0,
    "-0.5": 1,
    "0.5": 2,
    "1.5": 3
  };
  return map[lane.toString()] ?? null;
}

// USC + 音源の読み込み
function loadAndStart() {
  fetch("./data/usc/Shiningstar.usc")
    .then(res => res.json())
    .then(data => {
      const chart = data.usc;
      offset = chart.offset;

      const bpmObj = chart.objects.find(obj => obj.type === "bpm");
      const bpm = bpmObj ? bpmObj.bpm : 120;
      const beatDuration = 60 / bpm;

      notes = chart.objects
        .filter(obj => obj.type === "single")
        .map(obj => ({
          time: obj.beat * beatDuration,
          lane: beatmaniaLaneIndex(obj.lane)
        }))
        .filter(n => n.lane !== null);

      return fetch("./data/music/Shiningstar.mp3");
    })
    .then(res => res.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => {
      audioBuffer = decoded;
      startGame();
    });
}

let audioStartTime = 0; // 追加：AudioContext上の再生開始時間

function startGame() {
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  audioStartTime = now + Math.max(offset, 0); // ← AudioContext時間基準に再生開始を記録
  source.start(audioStartTime); // 音声再生開始

  requestAnimationFrame(gameLoop); // 描画ループを開始
}

// ノート描画
function drawNote(note, currentTime) {
  const y = hitLineY - (note.time - currentTime) * noteSpeed;
  if (y > canvas.height || y < -50) return;
  ctx.fillStyle = "cyan";
  ctx.fillRect(note.lane * laneWidth + 10, y, laneWidth - 20, 20);
}

// 判定処理
let hitTextTimer = 0;
let hantei = 0;

function showHitText() {
  hitTextTimer = 30;
}

function handleHits(currentTime) {
  for (const key of pressedKeys) {
    const lane = keyToLane(key);
    if (lane === null) continue;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const delta = note.time - currentTime;

      if (note.lane === lane) {
        if (Math.abs(delta) < 0.041) {
          hantei = "P";
        } else if (delta > 0 && delta < 0.060) {
          hantei = "FG";
        } else if (delta < 0 && delta > -0.060) {
          hantei = "LG";
        } else {
          continue;
        }

        notes.splice(i, 1);
        showHitText();
        break;
      }
    }
  }
}

// HITテキスト描画
function drawHitText() {
  if (hitTextTimer > 0) {
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    switch (hantei) {
      case "P":
        ctx.fillStyle = "yellow";
        ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
        break;
      case "FG":
        ctx.fillStyle = "blue";
        ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
        break;
      case "LG":
        ctx.fillStyle = "red";
        ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
        break;
    }
    hitTextTimer--;
  }
}

// メインループ
function gameLoop() {
  const elapsed = audioCtx.currentTime - audioStartTime; // ← AudioContext時間から再生経過秒数を取得

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.fillRect(0, hitLineY, canvas.width, 4);

  for (const note of notes) {
    drawNote(note, elapsed);
  }

  handleHits(elapsed);
  drawHitText();

  requestAnimationFrame(gameLoop);
}
