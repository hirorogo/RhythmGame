let audioSource = null; // ← AudioSourceNode を保持
let animationId = null; // ← requestAnimationFrame ID を保持
let noteTapBuffer = null;
let noteTapExBuffer = null;

let judge = null; // 判定幅を格納する変数

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.height = window.innerHeight;
canvas.width = window.innerWidth * 0.3;
const laneCount = 4;
const laneWidth = canvas.width / laneCount;
let noteSpeed;
const hitLineY = canvas.height - (window.innerHeight * 0.15);

const clearBorder = 800000; // クリアスコアの閾値80万
let difficulty = "";
let notes = []
let audioCtx = new (window.AudioContext || window.AudioContext)();
let gainNode = audioCtx.createGain(); // ★追加
gainNode._connected = false;
let audioBuffer = null;
let audioStartTime = 0;
let offset = 0;

let maxcombo = 0;
let NowCombo = 0;
let perfectCount = 0;
let greatCount = 0;
let badCount = 0;
let missCount = 0;
let fastCount = 0;
let lateCount = 0;
let exScore = 0;
let maxExScore = 0;

let missTextTimer = 0;
let isMiss = false;

let C_PerfectMode = false;
let isPlaying = false;
let isReady = false;

const perfectDisplay = document.getElementById("perfect");
const greatDisplay = document.getElementById("great");
const badDisplay = document.getElementById("bad");
const missDisplay = document.getElementById("miss");
const flDisplay = document.getElementById("fl");
const ComboDisplay = document.querySelector(".combo-container");
const ComboDisplayText = document.getElementById("combo");
const soundTimingDisplay = document.getElementById("soundTiming");

const pressedKeys = new Set();

const ChartDataLocation = "./data";
let musicname;

document.addEventListener("keydown", (e) => {
    const laneIndex = keyToLane(e.key);
    if (laneIndex !== null) {
        const currentTime = audioCtx.currentTime - audioStartTime;
        handleHits(currentTime, laneIndex);  // 修正済: 長押し防止
    }
    if (isReady){
        if (e.code === "Space" && !isPlaying) {
            isReady = false;
            document.getElementById("AreyouReady").style.display = "none";
            loadAndStart();
        }
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

function beatmaniaLaneIndex(lane, isMirror) {
    const map = {};
    if (isMirror) {
        map["-1.5"] = 3;
        map["-0.5"] = 2;
        map["0.5"] = 1;
        map["1.5"] = 0;
    } else {
        map["-1.5"] = 0;
        map["-0.5"] = 1;
        map["0.5"] = 2;
        map["1.5"] = 3;
    }
    return map[lane.toString()] ?? null;
}

function hanteiDiff() {
    if (C_PerfectMode) {
        judge = overJudgementSecIndex[difficulty];
    } else {
        judge = judgementSecIndex[difficulty];
    }
    if (!judge) {
        console.error("Invalid difficulty:", difficulty);
        alert("判定設定エラーのため、MASTER相当で再生します。");
        judge = judgementSecIndex["MAS"];
    }
}
function Disabling() {
    document.getElementById("gameCanvas").style.zIndex = 100;
    document.getElementById("difficulty").disabled = true;
    document.getElementById("startButton").disabled = true;
    document.getElementById("hispeed").disabled = true;
}

function showAreYouReady() {
    document.getElementById("AreyouReady").style.display = "block";
    isReady = true;
}

// USC + 音源読み込み開始
function loadAndStart() {
    musicname = document.getElementById("selectMusic").value;
    difficulty = document.getElementById("difficulty").value;
    C_PerfectMode = document.getElementById("cPerfectCheck").checked;
    let isMirror = false;

    setVolume();
    Disabling();
    hanteiDiff(); // 判定幅を設定

    const chartData = `${ChartDataLocation}/${musicname}/usc/${difficulty}.usc`;
    const chartMusic = `${ChartDataLocation}/${musicname}/music/${musicname}.mp3`;

    if (document.getElementById("mirrorCheck").checked) {
        isMirror = true;
    } else {
        isMirror = false;
    }

    // ノーツタップ音もロード
    fetch('./data/system/noteTap.wav')
        .then(res => res.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => {
            noteTapBuffer = decoded;
        });

    fetch(chartData)
        .then(res => res.json())
        .then(data => {
            const chart = data.usc;
            soundTiming = Number(soundTimingDisplay.value);
            offset = (chart.offset || 0) + soundTiming + 0.05;
            console.log("Offset loaded:", offset);

            const bpmObj = chart.objects.find(obj => obj.type === "bpm");
            const bpm = bpmObj ? bpmObj.bpm : 158;
            const beatDuration = 60 / bpm;
            notes = chart.objects
                .filter(obj => obj.type === "single")
                .map(obj => ({
                    time: obj.beat * beatDuration + offset, // 🔧 offsetを加算
                    lane: beatmaniaLaneIndex(obj.lane, isMirror),
                    critical: obj.critical || false,
                    played: false // サウンド再生済みフラグ追加
                }))
                .filter(n => n.lane !== null);
                maxExScore = 10 * (notes.filter(n => n.critical).length);

            return fetch(chartMusic);
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
    isPlaying = true;

    // 既存のaudioSourceがあれば停止・切断
    if (audioSource) {
        try { audioSource.stop(); } catch (e) { }
        try { audioSource.disconnect(); } catch (e) { }
        audioSource = null;
    }

    // gainNodeが未接続なら接続
    if (!gainNode._connected) {
        gainNode.connect(audioCtx.destination);
        gainNode._connected = true;
    }

    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(gainNode);

    audioStartTime = audioCtx.currentTime;
    audioSource.start(audioStartTime);

    caching();

    animationId = requestAnimationFrame(gameLoop);
}

function setVolume() {
    gainNode.gain.value = Number(document.getElementById("volumeSlider").value); // volは0.0～1.0
}

// ノート描画
function drawNote(note, currentTime) {
    const y = hitLineY - (note.time - currentTime) * noteSpeed;
    if (y > canvas.height || y < -50) return;

    if (note.critical) {
        ctx.fillStyle = "orange";
        ctx.fillRect(note.lane * laneWidth + 10, y, laneWidth - 20, 20);
    } else {
        ctx.fillStyle = "cyan";
        ctx.fillRect(note.lane * laneWidth + 10, y, laneWidth - 20, 20);
    }


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
        if (note.time < currentTime - judge.bad) { // 150ms 過ぎたノートはMISS扱い
            notes.splice(i, 1);
            i--; // spliceしたのでインデックス調整
            isMiss = true;
            missTextTimer = 30;
            missCount++;
        }
    }
}

function handleHits(currentTime, laneIndex) {
    // 該当レーンのノートだけを抽出
    const hitWindow = judge.bad; // 判定幅（300ms）
    const targetNotes = notes.filter(note =>
        note.lane === laneIndex &&
        Math.abs(note.time - currentTime) <= hitWindow
    );

    // 最も近いノートを優先して処理（closest to currentTime）
    if (targetNotes.length > 0) {
        targetNotes.sort((a, b) => Math.abs(a.time - currentTime) - Math.abs(b.time - currentTime));
        const note = targetNotes[0];
        const delta = note.time - currentTime;

        // 通常ノーツ用判定テーブル
        const judgementTable = [
            { type: "PERFECT", check: Math.abs(delta) < judge.perfect, FL: null },
            { type: "F-GREAT", check: delta > 0 && delta < judge.great, FL: "fast" },
            { type: "L-GREAT", check: delta < 0 && delta > -judge.great, FL: "late" },
            { type: "F-BAD", check: delta > judge.great && delta < judge.bad, FL: "fast" },
            { type: "L-BAD", check: delta < -judge.great && delta > -judge.bad, FL: "late" }
        ];

        // 通常ノーツ用C-PERFECT判定テーブル
        const judgementTableCP = [
            { type: "PERFECT", check: Math.abs(delta) < judge.Cperfect, FL: null },
            { type: "F-PERFECT", check: delta > 0 && delta < judge.perfect, FL: "fast" },
            { type: "L-PERFECT", check: delta < 0 && delta > -judge.perfect, FL: "late" },
            { type: "F-GREAT", check: delta > 0 && delta < judge.great, FL: "fast" },
            { type: "L-GREAT", check: delta < 0 && delta > -judge.great, FL: "late" },
            { type: "F-BAD", check: delta > judge.great && delta < judge.bad, FL: "fast" },
            { type: "L-BAD", check: delta < -judge.great && delta > -judge.bad, FL: "late" }
        ];

        // criticalノーツ用判定テーブル（現状は通常と同じ）
        const judgementTableCritical = [
            { type: "EX-PERFECT", check: Math.abs(delta) < judge.Cperfect, FL: null },
            { type: "EX-F-PERFECT", check: delta > 0 && delta < judge.perfect, FL: null },
            { type: "EX-L-PERFECT", check: delta < 0 && delta > -judge.perfect, FL: null },
            { type: "EX-F-GREAT", check: delta > 0 && delta < judge.great, FL: "fast" },
            { type: "EX-L-GREAT", check: delta < 0 && delta > -judge.great, FL: "late" },
            { type: "EX-F-BAD", check: delta > judge.great && delta < judge.bad, FL: "fast" },
            { type: "EX-L-BAD", check: delta < -judge.great && delta > -judge.bad, FL: "late" }
        ];

        // criticalノーツ用C-PERFECT判定テーブル（現状は通常と同じ）
        const judgementTableCPCritical = [
            { type: "EX-PERFECT", check: Math.abs(delta) < judge.Cperfect, FL: null },
            { type: "EX-F-PERFECT", check: delta > 0 && delta < judge.perfect, FL: "fast" },
            { type: "EX-L-PERFECT", check: delta < 0 && delta > -judge.perfect, FL: "late" },
            { type: "EX-F-GREAT", check: delta > 0 && delta < judge.great, FL: "fast" },
            { type: "EX-L-GREAT", check: delta < 0 && delta > -judge.great, FL: "late" },
            { type: "EX-F-BAD", check: delta > judge.great && delta < judge.bad, FL: "fast" },
            { type: "EX-L-BAD", check: delta < -judge.great && delta > -judge.bad, FL: "late" }
        ];

        // criticalノーツかどうかで判定テーブルを切り替え
        let useTable;
        if (note.critical) {
            useTable = C_PerfectMode ? judgementTableCPCritical : judgementTableCritical;
        } else {
            useTable = C_PerfectMode ? judgementTableCP : judgementTable;
        }

            console.log(exScore);

        for (const judgement of useTable) {
            if (judgement.check) {
                showHitText(judgement.type);

                switch (judgement.type) {
                    case "PERFECT":
                    case "F-PERFECT":
                    case "L-PERFECT":
                        perfectCount++;
                        NowCombo++;
                        playNoteTap();
                        break;
                    case "F-GREAT":
                    case "L-GREAT":
                        greatCount++;
                        NowCombo++;
                        playNoteTap();
                        break;
                    case "F-BAD":
                    case "L-BAD":
                        badCount++;
                        NowCombo++;
                        break;

                    case "EX-PERFECT":
                        perfectCount++;
                        NowCombo++;
                        exScore = exScore + 10;
                        playNoteTap("ex");
                        break;
                    case "EX-F-PERFECT":
                    case "EX-L-PERFECT":
                        perfectCount++;
                        NowCombo++;
                        exScore = exScore + 8;
                        playNoteTap("ex");
                        break;
                    case "EX-F-GREAT":
                    case "EX-L-GREAT":
                        greatCount++;
                        NowCombo++;
                        exScore = exScore + 4;
                        playNoteTap("ex");
                        break;
                    case "EX-F-BAD":
                    case "EX-L-BAD":
                        badCount++;
                        NowCombo++;
                        exScore = exScore + 1;
                        playNoteTap("ex");
                        break;
                }
                // F/Lのカウント
                if (judgement.FL === "fast") {
                    fastCount++;
                } else if (judgement.FL === "late") {
                    lateCount++;
                }

                break; // 最初にヒットしたノートで処理を終了
            }
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
            case "F-PERFECT":
                ctx.fillStyle = "#1da8ffff";
                ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
                break;
            case "L-PERFECT":
                ctx.fillStyle = "#ff6b6bff";
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

            case "EX-PERFECT":
                ctx.fillStyle = "#e5ff00ff";
                ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
                break;
            case "EX-F-PERFECT":
                if (C_PerfectMode){
                    ctx.fillStyle = "#1da8ffff";
                    ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
                } else {
                    ctx.fillStyle = "#e5ff00ff";
                    ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
                }
                break;
            case "EX-L-PERFECT":
                if (C_PerfectMode){
                    ctx.fillStyle = "#ff6b6bff";
                    ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
                } else {
                    ctx.fillStyle = "#e5ff00ff";
                    ctx.fillText("PERFECT", canvas.width / 2, hitLineY - 50);
                }
                break;
            case "EX-F-GREAT":
                ctx.fillStyle = "blue";
                ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
                break;
            case "EX-L-GREAT":
                ctx.fillStyle = "red";
                ctx.fillText("GREAT", canvas.width / 2, hitLineY - 50);
                break;
            case "EX-F-BAD":
                ctx.fillStyle = "green";
                ctx.fillText("BAD", canvas.width / 2, hitLineY - 50);
                break;
            case "EX-L-BAD":
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
        ctx.fillText("MISS", canvas.width / 2, hitLineY - 100);
        missTextTimer--;
        NowCombo = 0; // MISSしたらコンボをリセット
    }
}

function resetGame() {
    // 音声停止
    if (audioSource) {
        try { audioSource.stop(); } catch (e) { }
        try { audioSource.disconnect(); } catch (e) { }
        audioSource = null;
    }

    // アニメーション停止
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // AudioContextとGainNodeのリセット
    audioCtx.close().then(() => {
        audioCtx = new (window.AudioContext || window.AudioContext)();
        gainNode = audioCtx.createGain();
        gainNode._connected = false;
        audioBuffer = null;
        audioStartTime = 0;
    });

    // 状態リセット
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
    judge = null; // 判定幅をリセット
    NowCombo = 0; // コンボをリセット
    exScore = 0;
    maxExScore = 0;
    maxcombo = 0;
    isPlaying = false;

    // UIの状態リセット
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById("difficulty").disabled = false;
    document.getElementById("startButton").disabled = false;
    document.getElementById("hispeed").disabled = false;

    // スコア表示リセット
    perfectDisplay.textContent = `PERFECT: 0`;
    greatDisplay.textContent = `GREAT: 0`;
    badDisplay.textContent = `BAD: 0`;
    missDisplay.textContent = `MISS: 0`;
    flDisplay.textContent = `F/L: 0/0`;
    document.getElementById("resetButton").remove(); // リセットボタン削除
    document.getElementById("gameCanvas").style.zIndex = 10; // キャンバスのz-indexを元に戻す
    ComboDisplay.style.zIndex = 1; // コンボ表示のz-indexを元に戻す
    ComboDisplayText.textContent = "0"; // コンボ表示をリセット
}

function resultgame() {
    let resultCF = "";
    const notescore = 1000000 / maxcombo;// 1,000,000 ÷ ノーツ数
    let criticalScore = Math.floor(exScore / maxExScore * 10000); // exスコアを最大値で割って1万点満点に換算
    console.log(criticalScore);
    let cf = "";
    let score = Math.floor( criticalScore + (perfectCount * notescore) + (greatCount * notescore * 0.9) + (badCount * notescore * 0.5));
    let result;
    console.log(`score: ${score}`);
    ComboDisplay.style.zIndex = 1;

    if (missCount === 0 && greatCount === 0 && badCount === 0) {
        result = "ALL PERFECT!";
        score = 1000000 + criticalScore;
    } else if (missCount === 0 && badCount === 0) {
        result = "FULL COMBO+";
    } else if (missCount === 0) {
        result = "FULL COMBO";
    }
    if (score >= clearBorder) {
        resultCF = "CLEAR";
        cf = "CLEAR";
    } else {
        resultCF = "FAILED";
        cf = "FAILED";
    }
    switch (result) {
        case "ALL PERFECT!":
            ctx.fillStyle = "gold";
            break;
        case "FULL COMBO+":
            ctx.fillStyle = "orange";
            break;
        case "FULL COMBO":
            ctx.fillStyle = "green";
            break;
        default:
            if (cf === "CLEAR") {
                ctx.fillStyle = "blue";
                result = "";
            }
            else {
                ctx.fillStyle = "red";
                result = "";
            }
            break;
    }

    isPlaying = false;
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
    if (document.getElementById("resetButton")) {
        return; // 既にボタンが存在する場合は何もしない
    }
    createBTN();
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


    handleHits(elapsed);
    drawHitText();
    handleMisses(elapsed);
    drawMissText();
    updateScore();
    animationId = requestAnimationFrame(gameLoop); // ← ID 更新
}

function updateScore() {
    if (!isPlaying) return; // ゲーム中でなければ更新しない
    perfectDisplay.textContent = `PERFECT: ${perfectCount}`;
    greatDisplay.textContent = `GREAT: ${greatCount}`;
    badDisplay.textContent = `BAD: ${badCount}`;
    missDisplay.textContent = `MISS: ${missCount}`;
    flDisplay.textContent = `F/L: ${fastCount}/${lateCount}`;
    if (NowCombo == 0) {
        ComboDisplay.style.zIndex = 1;
    }
    else {
        ComboDisplay.style.zIndex = 109;
        ComboDisplayText.textContent = `${NowCombo}`;
    }
}

function createBTN() {
    const newDiv = document.createElement("div");
    const button = document.createElement("button");
    newDiv.className = "reset-container";
    button.id = "resetButton";
    button.textContent = "もう一度プレイ";
    button.onclick = resetGame;
    button.style.zIndex = 110; // ボタンのz-indexを設定
    newDiv.appendChild(button);
    document.body.appendChild(newDiv);
}

function playNoteTap(type) {
    if (type === "ex") {
        if (!noteTapBuffer) return;
        const src = audioCtx.createBufferSource();
        src.buffer = noteTapBuffer;
        src.playbackRate.value = 1.5;
        src.connect(gainNode);
        src.start();
        return;
    }
    if (!noteTapBuffer) return;
    const src = audioCtx.createBufferSource();
    src.buffer = noteTapBuffer;
    src.connect(gainNode);
    src.start();
}