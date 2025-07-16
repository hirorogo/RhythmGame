const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const laneCount = 4;
const laneWidth = canvas.width / laneCount;
const noteSpeed = 400; // px/sec
const hitLineY = canvas.height - 100;

let notes = [];
let startTime = null;
let audio = new Audio("audio.mp3"); // 音声ファイルのパスを指定

const pressedKeys = new Set(); // 現在押されているキー

let hitTextTimer = 0; // HITテキスト表示タイマー

// キー押下状態を管理
document.addEventListener("keydown", e => pressedKeys.add(e.key));
document.addEventListener("keyup", e => pressedKeys.delete(e.key));

// キー → レーン番号変換
function keyToLane(key) {
    switch (key) {
        case "d": return 0;
        case "f": return 1;
        case "j": return 2;
        case "k": return 3;
        default: return null;
    }
}

// USC読み込み
let offset = 0;

fetch("score.usc")
    .then(res => res.json())
    .then(data => {
        offset = data.offset || 0; // ← オフセットを読み取る

        notes = data.notes
            .filter(n => n.type === "tap")
            .map(n => ({
                lane: n.lane,
                time: n.time + offset // ← オフセットを適用！
            }));

        audio.addEventListener("canplaythrough", () => {
            audio.play();
            startTime = performance.now();
            requestAnimationFrame(gameLoop);
        });
    });

// ノート描画
function drawNote(note, currentTime) {
    const y = hitLineY - (note.time - currentTime) * noteSpeed;
    if (y > canvas.height || y < -50) return;

    ctx.fillStyle = "cyan";
    ctx.fillRect(note.lane * laneWidth + 10, y, laneWidth - 20, 20);
}
function showHitText() {
    hitTextTimer = 30; // 30フレーム（0.5秒）表示
}
let hantei = 0
// 同時押しHIT処理
function handleHits(currentTime) {
    for (const key of pressedKeys) {
        const lane = keyToLane(key);
        if (lane === null) continue;

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            if (
                note.lane === lane &&
                Math.abs(note.time - currentTime) < 0.041
            ) {
                console.log(`HIT! lane ${lane}`);
                notes.splice(i, 1);
                showHitText();
                hantei = "P";
                break;
            }
            if (
                note.lane === lane &&
                (note.time - currentTime) < 0.060 &&
                (note.time - currentTime) > 0
            ) {
                console.log(`HIT! lane ${lane}`);
                notes.splice(i, 1);
                showHitText();
                hantei = "FG";
                break;
            }
            if (
                note.lane === lane &&
                (note.time - currentTime) > -0.060 &&
                (note.time - currentTime) < 0
            ) {
                console.log(`HIT! lane ${lane}`);
                notes.splice(i, 1);
                showHitText();
                hantei = "LG";
                break;
            }
        }
    }
}
function drawHitText() {
    if (hitTextTimer > 0) {
        if (hantei === "P") {
            ctx.fillStyle = "green";
            ctx.font = "40px Arial";
            ctx.fillStyle = "yellow";
            ctx.textAlign = "center";
            ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
            hitTextTimer--;
        }
        if (hantei === "FG") {
            ctx.fillStyle = "green";
            ctx.font = "40px Arial";
            ctx.fillStyle = "blue";
            ctx.textAlign = "center";
            ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
            hitTextTimer--;
        }
        if (hantei === "LG") {
            ctx.fillStyle = "green";
            ctx.font = "40px Arial";
            ctx.fillStyle = "red";
            ctx.textAlign = "center";
            ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
            hitTextTimer--;
        }
    }
}
// メインループ
function gameLoop(timestamp) {
    const elapsed = (timestamp - startTime) / 1000;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 判定ライン
    ctx.fillStyle = "black";
    ctx.fillRect(0, hitLineY, canvas.width, 4);

    // ノーツ描画
    for (const note of notes) {
        drawNote(note, elapsed);
    }

    // 同時押し判定
    handleHits(elapsed);
    drawHitText();
    requestAnimationFrame(gameLoop);
}
