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
let longNotes = [] // ロングノーツ配列
let audioCtx = new (window.AudioContext || window.AudioContext)();
let gainNode = audioCtx.createGain(); // ★追加
gainNode._connected = false;
let audioBuffer = null;
let audioStartTime = 0;
let offset = 0;

let maxcombo = 0;
let NowCombo = 0;
let comboScale = 1.0; // コンボ表示のスケール
let comboScaleTarget = 1.0; // 目標スケール
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
const heldLanes = new Set(); // ロングノーツ用：現在押されているレーン

const ChartDataLocation = "./data";
let musicname;

document.addEventListener("keydown", (e) => {
    if (e.repeat) return; // キーリピート防止
    
    const laneIndex = keyToLane(e.key);
    if (laneIndex !== null) {
        const currentTime = audioCtx.currentTime - audioStartTime;
        heldLanes.add(laneIndex); // レーンを押下状態に追加
        handleAllNotes(currentTime, laneIndex);  // 通常ノーツとロングノーツを統合判定
    }
    if (isReady){
        if (e.code === "Space" && !isPlaying) {
            isReady = false;
            document.getElementById("AreyouReady").style.display = "none";
            loadAndStart();
        }
    }
});

document.addEventListener("keyup", (e) => {
    const laneIndex = keyToLane(e.key);
    if (laneIndex !== null) {
        heldLanes.delete(laneIndex); // レーンの押下状態を解除
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
            const sixteenthNoteDuration = beatDuration / 4; // 16分音符の間隔
            
            // 通常ノーツの処理
            notes = chart.objects
                .filter(obj => obj.type === "single")
                .map(obj => ({
                    time: obj.beat * beatDuration + offset,
                    lane: beatmaniaLaneIndex(obj.lane, isMirror),
                    critical: obj.critical || false,
                    played: false
                }))
                .filter(n => n.lane !== null);
            
            // ロングノーツ（スライド）の処理
            longNotes = chart.objects
                .filter(obj => obj.type === "slide")
                .map(obj => {
                    const startConn = obj.connections.find(c => c.type === "start");
                    const endConn = obj.connections.find(c => c.type === "end");
                    if (!startConn || !endConn) return null;
                    
                    const startLane = beatmaniaLaneIndex(startConn.lane, isMirror);
                    const endLane = beatmaniaLaneIndex(endConn.lane, isMirror);
                    const startTime = startConn.beat * beatDuration + offset;
                    const endTime = endConn.beat * beatDuration + offset;
                    
                    // 16分音符間隔でチェックポイントを生成
                    // 終点付近2ノーツ分（16分音符×3）は判定を緩くするため除外
                    const checkpoints = [];
                    const excludeEndTime = endTime - (sixteenthNoteDuration * 3);
                    for (let t = startTime + sixteenthNoteDuration; t <= excludeEndTime; t += sixteenthNoteDuration) {
                        checkpoints.push({
                            time: t,
                            checked: false
                        });
                    }
                    
                    return {
                        startTime: startTime,
                        endTime: endTime,
                        startLane: startLane,
                        endLane: endLane,
                        critical: obj.critical || false,
                        active: false, // ホールド開始フラグ
                        missed: false, // ミス判定
                        checkpoints: checkpoints
                    };
                })
                .filter(n => n !== null && n.startLane !== null);
            
            const criticalNoteCount = notes.filter(n => n.critical).length;
            const criticalLongNoteCount = longNotes.filter(n => n.critical).length;
            maxExScore = 10 * (criticalNoteCount + criticalLongNoteCount);

            return fetch(chartMusic);
        })
        .then(res => res.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => {
            audioBuffer = decoded;
            startGame();
            // maxcomboの計算：通常ノーツ + ロングノーツ（開始1 + チェックポイント数）
            let longNoteCombo = 0;
            for (const ln of longNotes) {
                longNoteCombo += 1 + ln.checkpoints.length; // 開始判定 + チェックポイント数
            }
            maxcombo = notes.length + longNoteCombo;
            console.log(`maxcombo: ${maxcombo} (notes: ${notes.length}, long: ${longNoteCombo})`);
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

// ロングノーツ描画
function drawLongNote(longNote, currentTime) {
    const startY = hitLineY - (longNote.startTime - currentTime) * noteSpeed;
    const endY = hitLineY - (longNote.endTime - currentTime) * noteSpeed;
    
    // 始点も終点も画面外（通過済み・下）なら描画しない
    if (startY > canvas.height && endY > canvas.height) return;
    // 始点も終点も画面外（まだ来ていない・上）なら描画しない  
    if (startY < -50 && endY < -50) return;
    
    const lane = longNote.startLane;
    const x = lane * laneWidth + 10;
    const width = laneWidth - 20;
    
    // ロングノーツは endY（終点・上側） から startY（始点・下側）まで描画
    // 描画範囲を画面内に収める
    const drawTopY = Math.max(endY, 0);           // 終点（上側）、画面外なら0から
    const drawBottomY = Math.min(startY, canvas.height);  // 始点（下側）、画面外ならcanvas.heightまで
    
    // ロングノーツ本体（縦長の矩形）- 常に描画
    if (drawBottomY > drawTopY) {
        // ロングノーツの色（active状態で変化）
        if (longNote.active) {
            ctx.fillStyle = longNote.critical ? "rgba(255, 165, 0, 0.6)" : "rgba(0, 255, 255, 0.6)";
        } else {
            ctx.fillStyle = longNote.critical ? "rgba(255, 200, 0, 0.5)" : "rgba(100, 200, 255, 0.5)";
        }
        
        // 本体の描画（上から下へ）
        ctx.fillRect(x, drawTopY, width, drawBottomY - drawTopY);
        
        // 枠線を追加（より見やすく）
        ctx.strokeStyle = longNote.critical ? "orange" : "cyan";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, drawTopY, width, drawBottomY - drawTopY);
    }
    
    // 開始位置のノート（判定ライン付近・下側）
    if (startY >= -50 && startY <= canvas.height) {
        ctx.fillStyle = longNote.critical ? "orange" : "cyan";
        ctx.fillRect(x, startY - 10, width, 20);
    }
    
    // 終了位置のマーカー（上側）
    if (endY >= -50 && endY <= canvas.height) {
        ctx.fillStyle = longNote.critical ? "darkorange" : "darkblue";
        ctx.fillRect(x, endY - 5, width, 10);
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

// 通常ノーツとロングノーツの統合判定（最も近いノーツのみ処理）
function handleAllNotes(currentTime, laneIndex) {
    const hitWindow = judge.bad;
    
    // 該当レーンの通常ノーツを抽出
    const targetNotes = notes.filter(note =>
        note.lane === laneIndex &&
        Math.abs(note.time - currentTime) <= hitWindow
    );
    
    // 該当レーンの未開始ロングノーツを抽出
    const targetLongNotes = longNotes.filter(ln =>
        ln.startLane === laneIndex &&
        !ln.active &&
        !ln.missed &&
        Math.abs(ln.startTime - currentTime) <= hitWindow
    );
    
    // 通常ノーツとロングノーツを統合し、最も近いものを選択
    let closestNote = null;
    let closestDelta = Infinity;
    let isLongNote = false;
    
    for (const note of targetNotes) {
        const delta = Math.abs(note.time - currentTime);
        if (delta < closestDelta) {
            closestDelta = delta;
            closestNote = note;
            isLongNote = false;
        }
    }
    
    for (const ln of targetLongNotes) {
        const delta = Math.abs(ln.startTime - currentTime);
        if (delta < closestDelta) {
            closestDelta = delta;
            closestNote = ln;
            isLongNote = true;
        }
    }
    
    // 最も近いノーツを処理
    if (closestNote) {
        if (isLongNote) {
            handleLongNoteStart(currentTime, closestNote);
        } else {
            handleSingleNote(currentTime, closestNote);
        }
    }
}

// 通常ノーツの判定処理
function handleSingleNote(currentTime, note) {
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

    // criticalノーツ用判定テーブル
    const judgementTableCritical = [
        { type: "EX-PERFECT", check: Math.abs(delta) < judge.Cperfect, FL: null },
        { type: "EX-F-PERFECT", check: delta > 0 && delta < judge.perfect, FL: null },
        { type: "EX-L-PERFECT", check: delta < 0 && delta > -judge.perfect, FL: null },
        { type: "EX-F-GREAT", check: delta > 0 && delta < judge.great, FL: "fast" },
        { type: "EX-L-GREAT", check: delta < 0 && delta > -judge.great, FL: "late" },
        { type: "EX-F-BAD", check: delta > judge.great && delta < judge.bad, FL: "fast" },
        { type: "EX-L-BAD", check: delta < -judge.great && delta > -judge.bad, FL: "late" }
    ];

    // criticalノーツ用C-PERFECT判定テーブル
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
                    triggerComboAnimation();
                    playNoteTap();
                    break;
                case "F-GREAT":
                case "L-GREAT":
                    greatCount++;
                    NowCombo++;
                    triggerComboAnimation();
                    playNoteTap();
                    break;
                case "F-BAD":
                case "L-BAD":
                    badCount++;
                    NowCombo++;
                    triggerComboAnimation();
                    break;

                case "EX-PERFECT":
                    perfectCount++;
                    NowCombo++;
                    triggerComboAnimation();
                    exScore = exScore + 10;
                    playNoteTap("ex");
                    break;
                case "EX-F-PERFECT":
                case "EX-L-PERFECT":
                    perfectCount++;
                    NowCombo++;
                    triggerComboAnimation();
                    exScore = exScore + 8;
                    playNoteTap("ex");
                    break;
                case "EX-F-GREAT":
                case "EX-L-GREAT":
                    greatCount++;
                    NowCombo++;
                    triggerComboAnimation();
                    exScore = exScore + 4;
                    playNoteTap("ex");
                    break;
                case "EX-F-BAD":
                case "EX-L-BAD":
                    badCount++;
                    NowCombo++;
                    triggerComboAnimation();
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

            break;
        }
    }

    // notes から該当ノートを削除
    const index = notes.indexOf(note);
    if (index > -1) notes.splice(index, 1);
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
                        triggerComboAnimation();
                        playNoteTap();
                        break;
                    case "F-GREAT":
                    case "L-GREAT":
                        greatCount++;
                        NowCombo++;
                        triggerComboAnimation();
                        playNoteTap();
                        break;
                    case "F-BAD":
                    case "L-BAD":
                        badCount++;
                        NowCombo++;
                        triggerComboAnimation();
                        break;

                    case "EX-PERFECT":
                        perfectCount++;
                        NowCombo++;
                        triggerComboAnimation();
                        exScore = exScore + 10;
                        playNoteTap("ex");
                        break;
                    case "EX-F-PERFECT":
                    case "EX-L-PERFECT":
                        perfectCount++;
                        NowCombo++;
                        triggerComboAnimation();
                        exScore = exScore + 8;
                        playNoteTap("ex");
                        break;
                    case "EX-F-GREAT":
                    case "EX-L-GREAT":
                        greatCount++;
                        NowCombo++;
                        triggerComboAnimation();
                        exScore = exScore + 4;
                        playNoteTap("ex");
                        break;
                    case "EX-F-BAD":
                    case "EX-L-BAD":
                        badCount++;
                        NowCombo++;
                        triggerComboAnimation();
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

// ロングノーツの開始判定処理（キー押下時のみ呼ばれる）
function handleLongNoteStart(currentTime, ln) {
    const delta = ln.startTime - currentTime;
    let judgementResult = null;
    
    // 通常ノーツと同じ判定テーブルを使用
    if (ln.critical) {
        // criticalノーツ用判定
        if (C_PerfectMode) {
            if (Math.abs(delta) < judge.Cperfect) {
                judgementResult = { type: "EX-PERFECT", count: "perfect" };
                exScore += 10;
            } else if (delta > 0 && delta < judge.perfect) {
                judgementResult = { type: "EX-F-PERFECT", count: "perfect" };
                exScore += 8;
            } else if (delta < 0 && delta > -judge.perfect) {
                judgementResult = { type: "EX-L-PERFECT", count: "perfect" };
                exScore += 8;
            } else if (delta > 0 && delta < judge.great) {
                judgementResult = { type: "EX-F-GREAT", count: "great" };
                exScore += 4;
            } else if (delta < 0 && delta > -judge.great) {
                judgementResult = { type: "EX-L-GREAT", count: "great" };
                exScore += 4;
            } else if (delta > judge.great && delta < judge.bad) {
                judgementResult = { type: "EX-F-BAD", count: "bad" };
                exScore += 1;
            } else if (delta < -judge.great && delta > -judge.bad) {
                judgementResult = { type: "EX-L-BAD", count: "bad" };
                exScore += 1;
            }
        } else {
            if (Math.abs(delta) < judge.perfect) {
                judgementResult = { type: "EX-PERFECT", count: "perfect" };
                exScore += 10;
            } else if (delta > 0 && delta < judge.great) {
                judgementResult = { type: "EX-F-GREAT", count: "great" };
                exScore += 4;
            } else if (delta < 0 && delta > -judge.great) {
                judgementResult = { type: "EX-L-GREAT", count: "great" };
                exScore += 4;
            } else if (delta > judge.great && delta < judge.bad) {
                judgementResult = { type: "EX-F-BAD", count: "bad" };
                exScore += 1;
            } else if (delta < -judge.great && delta > -judge.bad) {
                judgementResult = { type: "EX-L-BAD", count: "bad" };
                exScore += 1;
            }
        }
    } else {
        // 通常ノーツ用判定
        if (C_PerfectMode) {
            if (Math.abs(delta) < judge.Cperfect) {
                judgementResult = { type: "PERFECT", count: "perfect" };
            } else if (delta > 0 && delta < judge.perfect) {
                judgementResult = { type: "F-PERFECT", count: "perfect" };
            } else if (delta < 0 && delta > -judge.perfect) {
                judgementResult = { type: "L-PERFECT", count: "perfect" };
            } else if (delta > 0 && delta < judge.great) {
                judgementResult = { type: "F-GREAT", count: "great" };
            } else if (delta < 0 && delta > -judge.great) {
                judgementResult = { type: "L-GREAT", count: "great" };
            } else if (delta > judge.great && delta < judge.bad) {
                judgementResult = { type: "F-BAD", count: "bad" };
            } else if (delta < -judge.great && delta > -judge.bad) {
                judgementResult = { type: "L-BAD", count: "bad" };
            }
        } else {
            if (Math.abs(delta) < judge.perfect) {
                judgementResult = { type: "PERFECT", count: "perfect" };
            } else if (delta > 0 && delta < judge.great) {
                judgementResult = { type: "F-GREAT", count: "great" };
            } else if (delta < 0 && delta > -judge.great) {
                judgementResult = { type: "L-GREAT", count: "great" };
            } else if (delta > judge.great && delta < judge.bad) {
                judgementResult = { type: "F-BAD", count: "bad" };
            } else if (delta < -judge.great && delta > -judge.bad) {
                judgementResult = { type: "L-BAD", count: "bad" };
            }
        }
    }
    
    if (judgementResult) {
        ln.active = true;
        showHitText(judgementResult.type);
        
        // 判定に応じたカウント
        switch (judgementResult.count) {
            case "perfect":
                perfectCount++;
                NowCombo++;
                triggerComboAnimation();
                playNoteTap(ln.critical ? "ex" : null);
                break;
            case "great":
                greatCount++;
                NowCombo++;
                triggerComboAnimation();
                playNoteTap(ln.critical ? "ex" : null);
                break;
            case "bad":
                badCount++;
                NowCombo++;
                triggerComboAnimation();
                playNoteTap(ln.critical ? "ex" : null);
                break;
        }
        
        // F/Lのカウント
        if (judgementResult.type.includes("F-")) {
            fastCount++;
        } else if (judgementResult.type.includes("L-")) {
            lateCount++;
        }
    }
}

// ロングノーツ判定処理（ホールド中とMISS判定のみ）
function handleLongNotes(currentTime) {
    for (let i = longNotes.length - 1; i >= 0; i--) {
        const ln = longNotes[i];
        
        const lane = ln.startLane;
        const isHeld = heldLanes.has(lane);
        
        // 開始判定を逃した場合はMISS（キー押下なしで通過した場合）
        if (!ln.active && !ln.missed) {
            if (ln.startTime < currentTime - judge.bad) {
                // 開始MISS + 未チェックのチェックポイント分もMISS
                const uncheckedCount = ln.checkpoints.filter(cp => !cp.checked).length;
                missCount += 1 + uncheckedCount;
                isMiss = true;
                missTextTimer = 30;
                NowCombo = 0;
                longNotes.splice(i, 1);
                continue;
            }
        }
        
        // ホールド中の判定
        if (ln.active) {
            // チェックポイント判定（16分音符間隔）
            for (const checkpoint of ln.checkpoints) {
                if (!checkpoint.checked && currentTime >= checkpoint.time) {
                    if (isHeld) {
                        // キーを押し続けている場合、チェックポイント成功
                        checkpoint.checked = true;
                        perfectCount++; // PERFECTとしてカウント
                        NowCombo++;
                        triggerComboAnimation();
                    } else {
                        // キーが離されていた場合はMISS
                        // 未チェックのチェックポイント分をすべてMISS
                        const remainingUnchecked = ln.checkpoints.filter(cp => !cp.checked).length;
                        missCount += remainingUnchecked;
                        isMiss = true;
                        missTextTimer = 30;
                        NowCombo = 0;
                        longNotes.splice(i, 1);
                        continue;
                    }
                }
            }
            
            // 終了判定
            if (currentTime >= ln.endTime) {
                // 成功 - 完了したロングノーツを削除
                longNotes.splice(i, 1);
                continue;
            }
        }
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
    longNotes = [];
    heldLanes.clear();
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
    comboScale = 1.0; // コンボスケールをリセット
    comboScaleTarget = 1.0; // コンボスケール目標をリセット
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
    let criticalScore = 0;
    if (maxExScore > 0) {
        criticalScore = Math.floor(exScore / maxExScore * 10000); // exスコアを最大値で割って1万点満点に換算
    }
    console.log(`Result - Perfect: ${perfectCount}, Great: ${greatCount}, Bad: ${badCount}, Miss: ${missCount}`);
    console.log(`MaxCombo: ${maxcombo}, Total Judged: ${perfectCount + greatCount + badCount + missCount}`);
    console.log(`Critical Score: ${criticalScore}, exScore: ${exScore}, maxExScore: ${maxExScore}`);
    
    let cf = "";
    let score = Math.floor(criticalScore + (perfectCount * notescore) + (greatCount * notescore * 0.9) + (badCount * notescore * 0.5));
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
    if (!isPlaying) return; // ゲーム終了後はループしない
    
    const elapsed = audioCtx.currentTime - audioStartTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fillRect(0, hitLineY, canvas.width, 4);

    // ロングノーツを先に描画（通常ノーツの下に表示）
    for (const longNote of longNotes) {
        drawLongNote(longNote, elapsed);
    }
    
    for (const note of notes) {
        drawNote(note, elapsed);
    }
    
    // 終了判定：全ノーツが処理され、かつ判定カウントが最大コンボに達したら
    // または音楽の長さを超えた場合
    const musicEnded = audioBuffer && elapsed > audioBuffer.duration + 2;
    const allNotesProcessed = notes.length === 0 && longNotes.length === 0;
    const allJudged = perfectCount + greatCount + badCount + missCount >= maxcombo;
    
    if ((allNotesProcessed && allJudged) || musicEnded) {
        resultgame();
        return; // ゲームループを終了
    }

    handleHits(elapsed);
    handleLongNotes(elapsed); // ロングノーツ判定追加
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
    
    // コンボ表示の更新とアニメーション
    if (NowCombo == 0) {
        ComboDisplay.style.zIndex = 1;
        comboScale = 1.0;
        comboScaleTarget = 1.0;
        ComboDisplay.style.transform = `scale(1.0)`;
    }
    else {
        ComboDisplay.style.zIndex = 109;
        ComboDisplayText.textContent = `${NowCombo}`;
        
        // スケールアニメーション（1.0 → 1.05 → 1.0）
        // 目標スケールに向かって滑らかに変化
        if (comboScale < comboScaleTarget) {
            comboScale += 0.015; // 拡大速度
            if (comboScale >= comboScaleTarget) {
                comboScale = comboScaleTarget;
                if (comboScaleTarget === 1.05) {
                    comboScaleTarget = 1.0; // 縮小開始
                }
            }
        } else if (comboScale > comboScaleTarget) {
            comboScale -= 0.01; // 縮小速度
            if (comboScale <= comboScaleTarget) {
                comboScale = comboScaleTarget;
            }
        }
        
        ComboDisplay.style.transform = `scale(${comboScale})`;
    }
}

// コンボ増加時にスケールアニメーションをトリガー
function triggerComboAnimation() {
    comboScaleTarget = 1.05;
    comboScale = 1.0;
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