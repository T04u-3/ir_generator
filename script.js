/**
 * IR-Generator - script.js
 * アプリケーション全体のライフサイクル管理、UIイベントハンドリング、パイプライン実行制御
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const fileOrigInput = document.getElementById('audio-original');
    const fileRecInput = document.getElementById('audio-recorded');
    const nameOrigLabel = document.getElementById('name-original');
    const nameRecLabel = document.getElementById('name-recorded');
    
    const btnAnalyze = document.getElementById('btn-analyze');
    const btnGenerate = document.getElementById('btn-generate');
    const btnDownload = document.getElementById('btn-download');
    
    const sectionProgress = document.getElementById('section-progress');
    const textProgressStatus = document.getElementById('text-progress-status');
    const textProgressPercent = document.getElementById('text-progress-percent');
    const barProgress = document.getElementById('bar-progress');
    
    const sectionResults = document.getElementById('section-results');
    const valRt60 = document.getElementById('val-rt60');
    const valEr = document.getElementById('val-er');
    const valDensity = document.getElementById('val-density');
    const valWidth = document.getElementById('val-width');
    
    const eqLow = document.getElementById('eq-low');
    const eqLmid = document.getElementById('eq-lmid');
    const eqMid = document.getElementById('eq-mid');
    const eqHmid = document.getElementById('eq-hmid');
    const eqHigh = document.getElementById('eq-high');
    
    const paramSampleRate = document.getElementById('param-samplerate');
    const paramRtScale = document.getElementById('param-rt-scale');
    const paramHfDamp = document.getElementById('param-hf-damp');
    const valRtScale = document.getElementById('val-rt-scale');
    const valHfDamp = document.getElementById('val-hf-damp');

    // --- 内部ステート保持用オブジェクト ---
    let originalFile = null;
    let recordedFile = null;
    let alignedAudioData = null; // audio.jsから返される同期済みオブジェクト
    let finalAnalysisResult = null; // analysis.jsの解析結果

    // --- 1. スライダー値のリアルタイムUI反映 ---
    paramRtScale.addEventListener('input', (e) => {
        valRtScale.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });

    paramHfDamp.addEventListener('input', (e) => {
        valHfDamp.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });

    // --- 2. ファイルインポート時のイベント処理 ---
    fileOrigInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            originalFile = e.target.files[0];
            nameOrigLabel.textContent = originalFile.name;
            nameOrigLabel.classList.remove('text-gray-500');
            nameOrigLabel.classList.add('text-amber-400', 'font-medium');
            checkReadyToAnalyze();
        }
    });

    fileRecInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            recordedFile = e.target.files[0];
            nameRecLabel.textContent = recordedFile.name;
            nameRecLabel.classList.remove('text-gray-500');
            nameRecLabel.classList.add('text-amber-400', 'font-medium');
            checkReadyToAnalyze();
        }
    });

    /**
     * 両方のファイルが揃ったら解析ボタンを有効化する
     */
    function checkReadyToAnalyze() {
        if (originalFile && recordedFile) {
            btnAnalyze.disabled = false;
            btnAnalyze.classList.remove('bg-gray-700', 'text-gray-400', 'cursor-not-allowed');
            btnAnalyze.classList.add('bg-amber-500', 'text-gray-900', 'hover:bg-amber-400', 'cursor-pointer');
        }
    }

    // --- 3. 音源解析の実行パイプライン ---
    btnAnalyze.addEventListener('click', async () => {
        if (!originalFile || !recordedFile) return;

        // UI状態のリセットとプログレス表示
        btnAnalyze.disabled = true;
        btnAnalyze.classList.replace('bg-amber-500', 'bg-gray-700');
        btnAnalyze.classList.replace('text-gray-900', 'text-gray-400');
        btnAnalyze.classList.add('cursor-not-allowed');
        
        sectionProgress.classList.remove('hidden');
        sectionResults.classList.add('hidden');
        btnGenerate.disabled = true;
        btnDownload.classList.add('hidden');

        try {
            // ステージ1: 各音源のデコード
            updateProgressBar('音声デコード中（大容量ファイルは数十秒かかります）...', 10);
            const origBuffer = await window.AudioProcessor.decodeFile(originalFile);
            const recBuffer = await window.AudioProcessor.decodeFile(recordedFile);

            // ステージ2: 相互相関による位置合わせ・音量正規化
            const alignedData = await window.AudioProcessor.processAndAlign(origBuffer, recBuffer, (percent) => {
                // percentは10〜100で戻るため、UI全体の進捗30%〜70%にマッピング
                const globalPercent = 15 + Math.floor(percent * 0.55);
                updateProgressBar('演奏の同期・クロス相関演算中...', globalPercent);
            });

            alignedAudioData = alignedData;

            // ステージ3: サンパレス特性の解析抽出
            updateProgressBar('福岡サンパレスの音響DNAを抽出中...', 75);
            const analysisResult = window.AudioAnalyzer.analyze(alignedAudioData, (percent) => {
                const globalPercent = 75 + Math.floor(percent * 0.20);
                updateProgressBar('音響シミュレーション解析中...', globalPercent);
            });

            finalAnalysisResult = analysisResult;

            // 解析結果のダッシュボード反映
            displayResults(analysisResult);

            // 進捗完了、次フェーズのアクティベート
            updateProgressBar('解析完了！特性が正常に抽出されました。', 100);
            setTimeout(() => {
                sectionProgress.classList.add('hidden');
                btnGenerate.disabled = false;
                btnGenerate.classList.remove('bg-gray-700', 'text-gray-400', 'cursor-not-allowed');
                btnGenerate.classList.add('bg-gradient-to-r', 'from-amber-500', 'to-orange-500', 'text-gray-900', 'hover:from-amber-400', 'hover:to-orange-400', 'cursor-pointer');
            }, 1000);

        } catch (error) {
            console.error(error);
            alert('エラーが発生しました:\n' + error.message);
            updateProgressBar('処理が中断されました。', 0);
        }
    });

    // --- 4. IR生成（WAV合成）の実行パイプライン ---
    btnGenerate.addEventListener('click', () => {
        if (!finalAnalysisResult || !alignedAudioData) return;

        btnGenerate.disabled = true;
        btnGenerate.textContent = '合成処理中...';

        // ユーザー調整値の取得
        const userParams = {
            sampleRate: paramSampleRate.value,
            rtScale: parseFloat(paramRtScale.value),
            hfDamp: parseFloat(paramHfDamp.value)
        };

        // バックグラウンドでIRをモデリング合成
        setTimeout(() => {
            try {
                // 1. 波形合成
                const irBuffer = window.IRGenerator.generate(finalAnalysisResult, userParams);

                // 2. 24bit WAVエンコード
                const wavBlob = window.WAVEncoder.encode24BitWav(irBuffer.left, irBuffer.right, irBuffer.sampleRate);

                // 3. ダウンロード用URLの生成と適用
                const downloadUrl = URL.createObjectURL(wavBlob);
                btnDownload.href = downloadUrl;
                
                // ファイル名にRT60の長さ情報を付与
                const actualRt60 = (finalAnalysisResult.rt60 * userParams.rtScale).toFixed(2);
                btnDownload.setAttribute('download', `fukuoka_sunpalace_ir_${actualRt60}s.wav`);

                // UIの表示切り替え
                btnGenerate.textContent = 'hall_ir.wav を再合成';
                btnGenerate.disabled = false;
                btnDownload.classList.remove('hidden');
                
                // ダウンロードボタンへスムーズにスクロール
                btnDownload.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            } catch (err) {
                console.error(err);
                alert('IR合成中にエラーが発生しました: ' + err.message);
                btnGenerate.textContent = 'hall_ir.wav を合成';
                btnGenerate.disabled = false;
            }
        }, 100);
    });

    // --- 各種実用補助関数 ---
    
    /**
     * 進捗バーとテキストの更新
     */
    function updateProgressBar(statusText, percent) {
        textProgressStatus.innerHTML = percent < 100 
            ? `<i data-lucide="loader" class="animate-spin text-amber-500 w-4 h-4 inline-block align-text-bottom mr-1"></i> ${statusText}`
            : `<i data-lucide="check-circle-2" class="text-emerald-500 w-4 h-4 inline-block align-text-bottom mr-1"></i> ${statusText}`;
        textProgressPercent.textContent = percent + '%';
        barProgress.style.width = percent + '%';
        
        // 動的に追加されたアイコンをLucideに再スキャンさせる
        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * 解析結果を画面上のメーター・数値に反映
     */
    function displayResults(res) {
        sectionResults.classList.remove('hidden');
        
        // 数値アニメーションなしで確実に即座に固定値を代入
        valRt60.innerHTML = `${res.rt60.toFixed(2)}<span class="text-sm font-normal text-gray-400">s</span>`;
        valEr.innerHTML = `${res.earlyReflections.delayMs.toFixed(1)}<span class="text-sm font-normal text-gray-400">ms</span>`;
        valDensity.textContent = res.density.toFixed(2);
        valWidth.innerHTML = `${res.stereoWidth.toFixed(1)}<span class="text-sm font-normal text-gray-400">%</span>`;

        // EQプロファイルのデシベル表記更新
        eqLow.textContent = (res.eq.low > 0 ? '+' : '') + res.eq.low + ' dB';
        eqLmid.textContent = (res.eq.lmid > 0 ? '+' : '') + res.eq.lmid + ' dB';
        eqMid.textContent = (res.eq.mid > 0 ? '+' : '') + res.eq.mid + ' dB';
        eqHmid.textContent = (res.eq.hmid > 0 ? '+' : '') + res.eq.hmid + ' dB';
        eqHigh.textContent = (res.eq.high > 0 ? '+' : '') + res.eq.high + ' dB';
    }
});
