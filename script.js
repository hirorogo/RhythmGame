const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const laneCount = 4;
const laneWidth = canvas.width / laneCount;
let noteSpeed;
const hitLineY = canvas.height - 150;

let notes = []
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
let audioStartTime = 0;
let offset = 0;

let maxcombo = 0;
let perfectCount = 0;
let greatCount = 0;
let missCount = 0;

let missTextTimer = 0;
let isMiss = false;

const perfectDisplay = document.getElementById("perfect");
const greatDisplay = document.getElementById("great");
const missDisplay = document.getElementById("miss");

const pressedKeys = new Set();

document.addEventListener("keydown", (e) => {
    const laneIndex = keyToLane(e.key);
    if (laneIndex !== null) {
        const currentTime = audioCtx.currentTime - audioStartTime;
        handleHits(currentTime, laneIndex);  // 修正済: 長押し防止
    }
});

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

// USC + 音源読み込み開始
function loadAndStart() {
    fetch("./data/usc/Shiningstar_EXP.usc")
        .then(res => res.json())
        .then(data => {
            const chart = data.usc;
            offset = (chart.offset || 0) + 0.125;
            console.log("Offset loaded:", offset);

            const bpmObj = chart.objects.find(obj => obj.type === "bpm");
            const bpm = bpmObj ? bpmObj.bpm : 120;
            const beatDuration = 60 / bpm;

            notes = chart.objects
                .filter(obj => obj.type === "single")
                .map(obj => ({
                    time: obj.beat * beatDuration + offset, // 🔧 offsetを加算
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
            maxcombo = notes.length;
            console.log(`maxcombo: ${maxcombo}`);
        });
}

function startGame() {
    document.getElementById("startButton").disabled = true;
    document.getElementById("hispeed").disabled = true;
    let temp = document.getElementById("hispeed").value;
    noteSpeed = temp;
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    audioStartTime = audioCtx.currentTime; // 即再生（offset済）
    source.start(audioStartTime);
    requestAnimationFrame(gameLoop);
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
let hantei = "";

function showHitText(type) {
    hantei = type;
    hitTextTimer = 30;
}
// 判定処理
function handleMisses(currentTime) {
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.time < currentTime - 0.15) { // 150ms 過ぎたノートはMISS扱い
            notes.splice(i, 1);
            i--; // spliceしたのでインデックス調整
            isMiss = true;
            missTextTimer = 30;
            missCount++;
        }
    }
}

function handleHits(currentTime, laneIndex) {
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.lane !== laneIndex) continue;

        const delta = note.time - currentTime;

        if (Math.abs(delta) < 0.050) {
            showHitText("PERFECT");
            perfectCount++;
        } else if (delta > 0 && delta < 0.150) {
            showHitText("F-GREAT");
            greatCount++;
        } else if (delta < 0 && delta > -0.150) {
            showHitText("L-GREAT");
            greatCount++;
        } else {
            continue; // 判定範囲外
        }

        notes.splice(i, 1); // ノートを削除（同一ノートを複数回判定させない）
        break;
    }
}
function handleHits(currentTime, laneIndex) {
    // 該当レーンのノートだけを抽出
    const hitWindow = 0.150; // 判定幅（60ms）
    const targetNotes = notes.filter(note =>
        note.lane === laneIndex &&
        Math.abs(note.time - currentTime) <= hitWindow
    );

    // 最も近いノートを優先して処理（closest to currentTime）
    if (targetNotes.length > 0) {
        targetNotes.sort((a, b) => Math.abs(a.time - currentTime) - Math.abs(b.time - currentTime));
        const note = targetNotes[0];
        const delta = note.time - currentTime;
        
        if (Math.abs(delta) < 0.050) {
            showHitText("PERFECT");
            perfectCount++;
        } else if (delta > 0 && delta < 0.15) {
            showHitText("F-GREAT");
            greatCount++;
        } else if (delta < 0 && delta > -0.15) {
            showHitText("L-GREAT");
            greatCount++;
        }

        // notes から該当ノートを削除
        const index = notes.indexOf(note);
        if (index > -1) notes.splice(index, 1);
    } else {
        // 該当するノートがなければMISSにはしない（MISSは別タイミングで処理）
    }
}

// テキスト表示
function drawHitText() {
    if (hitTextTimer > 0) {
        ctx.font = "40px Arial";
        ctx.textAlign = "center";

        switch (hantei) {
            case "PERFECT":
                ctx.fillStyle = "yellow";
                ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
                break;
            case "F-GREAT":
                ctx.fillStyle = "blue";
                ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
                break;
            case "L-GREAT":
                ctx.fillStyle = "red";
                ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
                break;
        }

        hitTextTimer--;
    }
}

function drawMissText() {
    if (missTextTimer > 0) {
        ctx.font = "40px Arial";
        ctx.fillStyle = "gray";
        ctx.textAlign = "center";
        ctx.fillText("MISS", canvas.width / 2, hitLineY - 100);
        missTextTimer--;
    }
}

// メイン描画ループ
function gameLoop() {
    const elapsed = audioCtx.currentTime - audioStartTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fillRect(0, hitLineY, canvas.width, 4);

    for (const note of notes) {
        drawNote(note, elapsed);
    }
    if (perfectCount + greatCount + missCount === maxcombo) {
        console.log(perfectCount, greatCount, missCount);
    }
    perfectDisplay.textContent = `PERFECT: ${perfectCount}`;
    greatDisplay.textContent = `GREAT: ${greatCount}`;
    missDisplay.textContent = `MISS: ${missCount}`;
    handleHits(elapsed);
    drawHitText();
    handleMisses(elapsed);
    drawMissText();
    requestAnimationFrame(gameLoop);
}