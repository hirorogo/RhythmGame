let cashedhispeed = localStorage.getItem("hispeed");
let casheddifficulty = localStorage.getItem("difficulty");
let cashedC_PerfectMode = localStorage.getItem("CP");
let cashedVolume = localStorage.getItem("Volume");
let cashedOffset = localStorage.getItem("offset");

if (cashedhispeed) {
    document.getElementById("hispeed").value = cashedhispeed;
    document.getElementById("difficulty").value = casheddifficulty;
    document.getElementById("cPerfectCheck").checked = (cashedC_PerfectMode === "true");
    document.getElementById("volumeSlider").value = cashedVolume;
    document.getElementById("soundTiming").value = cashedOffset;
}

function caching() {
    localStorage.setItem("hispeed", noteSpeed);
    localStorage.setItem("difficulty", difficulty);
    localStorage.setItem("CP", C_PerfectMode);
    localStorage.setItem("Volume", document.getElementById("volumeSlider").value);
    localStorage.setItem("offset", document.getElementById("soundTiming").value);
}
function clearStorage() {
    if (confirm("キャッシュをクリアしますか？")) {
        localStorage.clear();
        location.reload();
    }
}