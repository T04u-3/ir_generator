// =========================
// IR Generator
// script.js
// =========================

const AudioContextClass =
window.AudioContext ||
window.webkitAudioContext;

const audioContext = new AudioContextClass();

const originalInput =
document.getElementById("originalFile");

const recordedInput =
document.getElementById("recordedFile");

const originalName =
document.getElementById("originalName");

const recordedName =
document.getElementById("recordedName");

const analyzeButton =
document.getElementById("analyzeButton");

const status =
document.getElementById("status");

let originalBuffer = null;
let recordedBuffer = null;

// ---------------------
// ファイル名表示
// ---------------------

originalInput.addEventListener("change", async e=>{

const file = e.target.files[0];

if(!file)return;

originalName.textContent=file.name;

originalBuffer =
await loadAudio(file);

checkReady();

});

recordedInput.addEventListener("change", async e=>{

const file = e.target.files[0];

if(!file)return;

recordedName.textContent=file.name;

recordedBuffer =
await loadAudio(file);

checkReady();

});

// ---------------------
// AudioBufferへ変換
// ---------------------

async function loadAudio(file){

status.textContent =
"音源を読み込み中...";

const arrayBuffer =
await file.arrayBuffer();

const audioBuffer =
await audioContext.decodeAudioData(arrayBuffer);

status.textContent =
"待機中";

return audioBuffer;

}

// ---------------------
// ボタン有効化
// ---------------------

function checkReady(){

if(
originalBuffer &&
recordedBuffer
){

status.textContent =
"解析できます";

analyzeButton.disabled=false;

}

}

// ---------------------
// 解析開始
// ---------------------

analyzeButton.addEventListener("click",()=>{

status.textContent=
"解析準備中...";

prepareAnalysis();

});

// ---------------------
// 次工程へ
// ---------------------

function prepareAnalysis(){

const original =
originalBuffer.getChannelData(0);

const recorded =
recordedBuffer.getChannelData(0);
const processed =
preprocessAudio(
    original,
    recorded
);

console.log(original.length);
console.log(recorded.length);

// graph.jsへ送る

drawWaveform(
original,
"waveCanvas"
);

drawWaveform(
processed,
"irCanvas"
);

// FFTは次回

status.textContent=
"読み込み完了";

}
