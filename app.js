import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';

const $ = (id) => document.getElementById(id);
const input = $('file-input');
const dropzone = $('dropzone');
const editor = $('editor');
const preview = $('preview');
const startRange = $('start-range');
const endRange = $('end-range');
const startTime = $('start-time');
const endTime = $('end-time');
const rangeSelection = $('range-selection');
const ffmpeg = new FFmpeg();
const ffmpegMessages = [];
ffmpeg.on('log', ({ message }) => {
  ffmpegMessages.push(message);
  if (ffmpegMessages.length > 30) ffmpegMessages.shift();
});

let sourceFile = null;
let sourceUrl = null;
let outputUrl = null;
let duration = 0;
let loaded = false;
let compressing = false;
let progressValue = 0;

const formatTime = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatBytes = (bytes) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(0)} KB`
  : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

function showError(message) {
  $('error-message').textContent = message;
  $('error-message').classList.remove('hidden');
}

function clearError() { $('error-message').classList.add('hidden'); }

function updateTrimUi(from = 'range') {
  if (!duration) return;
  let start = Number(startRange.value) / 1000 * duration;
  let end = Number(endRange.value) / 1000 * duration;
  if (from === 'start-time') start = Math.min(Math.max(0, Number(startTime.value) || 0), end - 0.2);
  if (from === 'end-time') end = Math.max(Math.min(duration, Number(endTime.value) || duration), start + 0.2);
  if (from === 'start-range') start = Math.min(start, end - 0.2);
  if (from === 'end-range') end = Math.max(end, start + 0.2);
  start = Math.max(0, start);
  end = Math.min(duration, end);
  if (from === 'start-time' || from === 'start-range') startRange.value = String(Math.round(start / duration * 1000));
  if (from === 'end-time' || from === 'end-range') endRange.value = String(Math.round(end / duration * 1000));
  startTime.value = start.toFixed(1).replace(/\.0$/, '');
  endTime.value = end.toFixed(1).replace(/\.0$/, '');
  $('start-label').textContent = formatTime(start);
  $('end-label').textContent = formatTime(end);
  const left = start / duration * 100;
  const right = end / duration * 100;
  rangeSelection.style.left = `${left}%`;
  rangeSelection.style.width = `${right - left}%`;
  if (from === 'start-range' || from === 'end-range') preview.currentTime = from === 'start-range' ? start : end;
}

function cleanResult() {
  $('result').classList.add('hidden');
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
}

function loadVideo(file) {
  if (!file || (!file.type.startsWith('video/') && !/\.(mkv|avi|mov|mp4|webm|m4v)$/i.test(file.name))) {
    showError('動画ファイルを選んでください。');
    return;
  }
  sourceFile = file;
  clearError();
  cleanResult();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);
  preview.src = sourceUrl;
  $('preview-placeholder').classList.remove('hidden');
  $('file-name').textContent = file.name;
  $('file-details').textContent = `${formatBytes(file.size)} · 読み込み中…`;
  dropzone.classList.add('hidden');
  editor.classList.remove('hidden');
  preview.onloadedmetadata = () => {
    duration = Number.isFinite(preview.duration) ? preview.duration : 0;
    if (!duration) {
      showError('動画の長さを読み取れませんでした。別の形式の動画をお試しください。');
      return;
    }
    $('preview-placeholder').classList.add('hidden');
    $('file-details').textContent = `${formatBytes(file.size)} · ${formatTime(duration)}`;
    startRange.value = '0';
    endRange.value = '1000';
    startTime.value = '0';
    endTime.value = duration.toFixed(1).replace(/\.0$/, '');
    updateTrimUi();
  };
  preview.onerror = () => $('preview-placeholder').classList.add('hidden');
}

input.addEventListener('change', () => {
  loadVideo(input.files?.[0]);
  input.value = '';
});
$('change-file').addEventListener('click', () => input.click());
for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
}
for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); });
}
dropzone.addEventListener('drop', (event) => loadVideo(event.dataTransfer.files?.[0]));
startRange.addEventListener('input', () => updateTrimUi('start-range'));
endRange.addEventListener('input', () => updateTrimUi('end-range'));
startTime.addEventListener('change', () => updateTrimUi('start-time'));
endTime.addEventListener('change', () => updateTrimUi('end-time'));
$('set-start').addEventListener('click', () => { startTime.value = preview.currentTime; updateTrimUi('start-time'); });
$('set-end').addEventListener('click', () => { endTime.value = preview.currentTime; updateTrimUi('end-time'); });

function setProgress(value, message) {
  progressValue = Math.max(progressValue, Math.min(99, value));
  $('progress-fill').style.width = `${progressValue}%`;
  $('progress-percent').textContent = `${Math.round(progressValue)}%`;
  if (message) $('progress-message').textContent = message;
}

function setBusy(busy) {
  compressing = busy;
  $('compress-button').disabled = busy;
  $('progress-area').classList.toggle('hidden', !busy);
  $('compress-button-label').textContent = busy ? '処理しています…' : '圧縮をはじめる';
}

async function ensureFFmpeg() {
  if (loaded) return;
  setProgress(4, '圧縮エンジンを読み込んでいます');
  // @ffmpeg/ffmpeg 0.12.10 is paired with @ffmpeg/core 0.12.6. This app
  // loads FFmpeg as an ES module, so its core must also use the ESM build.
  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
  const toBlobURL = async (url, mimeType) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`FFmpeg本体を読み込めませんでした (${response.status})`);
    return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mimeType }));
  };
  await ffmpeg.load({
    // The FFmpeg wrapper is imported from a CDN, so its default worker URL
    // points at that CDN and is rejected as cross-origin by browsers. Start a
    // same-origin module worker; it imports the official FFmpeg worker module.
    classWorkerURL: new URL('./vendor/ffmpeg-worker-entry.js', import.meta.url).href,
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  loaded = true;
  setProgress(12, '動画を準備しています');
}

async function compress() {
  if (!sourceFile || compressing) return;
  clearError();
  cleanResult();
  const start = Number(startTime.value) || 0;
  const end = Number(endTime.value) || duration;
  const clipDuration = end - start;
  const targetMB = Math.min(20, Math.max(1, Number($('size-target').value) || 20));
  $('size-target').value = targetMB;
  if (clipDuration < 0.3) { showError('切り出す範囲は0.3秒以上にしてください。'); return; }
  setBusy(true);
  progressValue = 0;
  setProgress(2, '圧縮エンジンを準備しています');
  let inputName = null;
  const outputName = 'clip.mp4';
  try {
    await ensureFFmpeg();
    const ext = sourceFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    inputName = `input.${ext}`;
    await ffmpeg.writeFile(inputName, new Uint8Array(await sourceFile.arrayBuffer()));
    const targetBytes = targetMB * 1024 * 1024 * 0.94;
    const audioKbps = 64;
    let videoKbps = Math.max(120, Math.floor((targetBytes * 8 / clipDuration / 1000) - audioKbps));
    let data = null;
    let actualBytes = 0;
    const maxHeight = Number($('resolution').value);

    for (let attempt = 0; attempt < 4; attempt++) {
      setProgress(15 + attempt * 18, attempt ? 'サイズを調整して再圧縮しています' : '動画を圧縮しています');
      try { await ffmpeg.deleteFile(outputName); } catch { /* first attempt has no output file */ }
      ffmpegMessages.length = 0;
      const exitCode = await ffmpeg.exec([
        '-ss', start.toFixed(3), '-i', inputName, '-t', clipDuration.toFixed(3),
        '-map', '0:v:0', '-map', '0:a?',
        '-vf', `scale=-2:min(${maxHeight}\\,ih)`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-b:v', `${videoKbps}k`, '-maxrate', `${Math.ceil(videoKbps * 1.15)}k`, '-bufsize', `${videoKbps * 2}k`,
        '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-movflags', '+faststart', '-sn', '-y', outputName,
      ]);
      if (exitCode !== 0) {
        const logTail = ffmpegMessages.slice(-6).join('\n');
        throw new Error(`FFmpegの変換に失敗しました (終了コード ${exitCode})${logTail ? `\n${logTail}` : ''}`);
      }
      data = await ffmpeg.readFile(outputName);
      actualBytes = data.byteLength;
      if (!actualBytes) throw new Error('FFmpegが空の動画を出力しました。入力動画と変換設定を確認してください。');
      if (actualBytes <= targetMB * 1024 * 1024) break;
      videoKbps = Math.max(100, Math.floor(videoKbps * targetMB * 1024 * 1024 / actualBytes * 0.9));
    }
    if (actualBytes > targetMB * 1024 * 1024) {
      throw new Error('この尺では目標サイズに収まりませんでした。動画の範囲を短くするか、画質の上限を下げてください。');
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    outputUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    $('download-link').href = outputUrl;
    $('download-link').download = `${sourceFile.name.replace(/\.[^.]+$/, '')}-discord.mp4`;
    $('result-title').textContent = '圧縮できました';
    const wasTrimmed = start > 0.1 || end < duration - 0.1;
    const reduction = Math.max(0, Math.round((1 - actualBytes / sourceFile.size) * 100));
    $('result-detail').textContent = wasTrimmed
      ? `${formatBytes(actualBytes)} · ${formatTime(clipDuration)}に切り出し`
      : `${formatBytes(actualBytes)} · 元動画から約${reduction}%削減`;
    $('result').classList.remove('hidden');
    setProgress(100, '完了しました');
  } catch (error) {
    console.error(error);
    showError(error?.message || '圧縮に失敗しました。別の動画でお試しください。');
  } finally {
    if (loaded) {
      if (inputName) { try { await ffmpeg.deleteFile(inputName); } catch { /* already removed */ } }
      try { await ffmpeg.deleteFile(outputName); } catch { /* already removed */ }
    }
    setBusy(false);
    $('progress-fill').style.width = '100%';
    $('progress-percent').textContent = '完了';
  }
}

$('compress-button').addEventListener('click', compress);
window.addEventListener('beforeunload', () => {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  if (outputUrl) URL.revokeObjectURL(outputUrl);
});
