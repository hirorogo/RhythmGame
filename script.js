let cashedhispeed = localStorage.getItem("hispeed");
if (!cashedhispeed) {
}
else {
    document.getElementById("hispeed").value = cashedhispeed;
}
let perfectSec = 0.033;// 33ms
let greatSec = 0.066;// <66ms
let badSec = 0.100;// >100ms
let missSec = 0.100;// >100ms

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const laneCount = 4;
const laneWidth = canvas.width / laneCount;
let noteSpeed;
const hitLineY = canvas.height - 150;

let difficulty = "";
let notes = []
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
let audioStartTime = 0;
let offset = 0;

let maxcombo = 0;
let perfectCount = 0;
let greatCount = 0;
let badCount = 0;
let missCount = 0;
let fastCount = 0;
let lateCount = 0;

let missTextTimer = 0;
let isMiss = false;

const perfectDisplay = document.getElementById("perfect");
const greatDisplay = document.getElementById("great");
const badDisplay = document.getElementById("bad");
const missDisplay = document.getElementById("miss");
const flDisplay = document.getElementById("fl");

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
    document.getElementById("difficulty").disabled = true;
    document.getElementById("startButton").disabled = true;
    document.getElementById("hispeed").disabled = true;
    difficulty = document.getElementById("difficulty").value;
    fetch(`./data/usc/Shiningstar_${difficulty}.usc`)
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
    let temp = document.getElementById("hispeed").value;
    noteSpeed = temp;
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    audioStartTime = audioCtx.currentTime; // 即再生（offset済）
    source.start(audioStartTime);

    localStorage.setItem("hispeed", noteSpeed);
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

/* function handleHits(currentTime, laneIndex) {
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.lane !== laneIndex) continue;

        const delta = note.time - currentTime;

        if (Math.abs(delta) < perfectSec) {
            showHitText("PERFECT");
            perfectCount++;
        } else if (delta > 0 && delta < greatSec) {
            showHitText("F-GREAT");
            greatCount++;
        } else if (delta < 0 && delta > -greatSec) {
            showHitText("L-GREAT");
            greatCount++;
        } else {
            continue; // 判定範囲外
        }

        notes.splice(i, 1); // ノートを削除（同一ノートを複数回判定させない）
        break;
    }
} */
function handleHits(currentTime, laneIndex) {
    // 該当レーンのノートだけを抽出
    const hitWindow = missSec; // 判定幅（300ms）
    const targetNotes = notes.filter(note =>
        note.lane === laneIndex &&
        Math.abs(note.time - currentTime) <= hitWindow
    );

    // 最も近いノートを優先して処理（closest to currentTime）
    if (targetNotes.length > 0) {
        targetNotes.sort((a, b) => Math.abs(a.time - currentTime) - Math.abs(b.time - currentTime));
        const note = targetNotes[0];
        const delta = note.time - currentTime;

        if (Math.abs(delta) < perfectSec) {
            showHitText("PERFECT");
            perfectCount++;
        } else if (delta > 0 && delta < greatSec) {
            showHitText("F-GREAT");
            greatCount++;
            fastCount++;
        } else if (delta < 0 && delta > -greatSec) {
            showHitText("L-GREAT");
            greatCount++;
            lateCount++;
        } else if (delta > greatSec && delta < badSec) {
            showHitText("F-BAD");
            badCount++;
            fastCount++;
        } else if (delta < -greatSec && delta > -badSec) {
            showHitText("L-BAD");
            badCount++;
            lateCount++;
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
            case "F-BAD":
                ctx.fillStyle = "green";
                ctx.fillText("BAD", canvas.width / 2, hitLineY - 50);
                break;
            case "L-BAD":
                ctx.fillStyle = "green";
                ctx.fillText("BAD", canvas.width / 2, hitLineY - 50);
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
        ctx.fillText("MISS", canvas.width / 2, hitLineY - 50);
        missTextTimer--;
    }
}

function resetGame() {
    notes = [];
    perfectCount = 0;
    greatCount = 0;
    badCount = 0;
    missCount = 0;
    fastCount = 0;
    lateCount = 0;
    hitTextTimer = 0;
    hantei = "";
    isMiss = false;
    missTextTimer = 0;

    document.getElementById("difficulty").disabled = false;
    document.getElementById("startButton").disabled = false;
    document.getElementById("hispeed").disabled = false;
    audioCtx.close().then(() => {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = null;
        audioStartTime = 0;
    });
}
function resultgame() {
    let resultCF = "";
    const notescore = 1000000 / maxcombo;// 1,000,000 ÷ ノーツ数
    let score = Math.floor((perfectCount * notescore) + (greatCount * notescore * 0.8) + (badCount * notescore * 0.5));
    let result;
    if (missCount === 0 && greatCount === 0 && badCount === 0) {
        result = "ALL PERFECT!!!!";
    } else if (missCount === 0 && badCount === 0) {
        result = "FULL COMBO+!!!!";
    } else if (missCount === 0) {
        result = "FULL COMBO!!!!";
    }
    if (score >= 750000) {
        resultCF = "CLEAR";
        cf = "CLEAR";
    } else {
        resultCF = "FAILED";
        cf = "FAILED";
    }
    switch (result) {
        case "ALL PERFECT!!!!":
            ctx.fillStyle = "gold";
            break;
        case "FULL COMBO+!!!!":
            ctx.fillStyle = "orange";
            break;
        case "FULL COMBO!!!!":
            ctx.fillStyle = "green";
            break;
        default:
            if (cf === "CLEAR") {
                ctx.fillStyle = "blue";
            }
            else {
                ctx.fillStyle = "red";
            }
            break;
    }

    score = score.toLocaleString();
    ctx.font = "30px Arial";
    ctx.textAlign = "center";
    ctx.strokeStyle = "black";
    ctx.strokeText(`${resultCF}`, canvas.width / 2, canvas.height / 2 - 100);
    ctx.strokeText(`${result}`, canvas.width / 2, canvas.height / 2 - 50);
    ctx.strokeText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2);
    ctx.fillText(`${resultCF}`, canvas.width / 2, canvas.height / 2 - 100);
    ctx.fillText(`${result}`, canvas.width / 2, canvas.height / 2 - 50);
    ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2);
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
    if (perfectCount + greatCount + badCount + missCount === maxcombo) {
        resultgame();
    }
    perfectDisplay.textContent = `PERFECT: ${perfectCount}`;
    greatDisplay.textContent = `GREAT: ${greatCount}`;
    badDisplay.textContent = `BAD: ${badCount}`;
    missDisplay.textContent = `MISS: ${missCount}`;
    flDisplay.textContent = `F/L: ${fastCount}/${lateCount}`;
    handleHits(elapsed);
    drawHitText();
    handleMisses(elapsed);
    drawMissText();
    requestAnimationFrame(gameLoop);
}