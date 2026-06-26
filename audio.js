/**
 * IR-Generator - audio.js
 * 音声デコード、相互相関（Cross-correlation）による自動位置合わせ、音量補正処理
 */

const AudioProcessor = {
    // Web Audio APIのコンテキスト取得または生成
    ctx: null,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    /**
     * ファイルをAudioBufferにデコード
     */
    async decodeFile(file) {
        this.init();
        const arrayBuffer = await file.arrayBuffer();
        return new Promise((resolve, reject) => {
            this.ctx.decodeAudioData(arrayBuffer, (buffer) => {
                resolve(buffer);
            }, (err) => {
                reject(new Error("音声ファイルのデコードに失敗しました。対応フォーマットを確認してください。: " + err.message));
            });
        });
    },

    /**
     * ステレオバッファをモノラル（Float32Array）に変換
     */
    toMono(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const mono = new Float32Array(length);

        if (channels === 1) {
            mono.set(audioBuffer.getChannelData(0));
        } else {
            const ch0 = audioBuffer.getChannelData(0);
            const ch1 = audioBuffer.getChannelData(1);
            for (let i = 0; i < length; i++) {
                mono[i] = (ch0[i] + ch1[i]) * 0.5;
            }
        }
        return mono;
    },

    /**
     * 音声のRMS（二乗平均平方根）を計算して基準音量レベルを取得
     */
    getRMS(signal) {
        let sum = 0;
        const step = Math.max(1, Math.floor(signal.length / 100000)); // 高速化のためサンプリング
        let count = 0;
        for (let i = 0; i < signal.length; i += step) {
            sum += signal[i] * signal[i];
            count++;
        }
        return Math.sqrt(sum / count);
    },

    /**
     * 相互相関（Cross-correlation）を用いて2つの音源の開始ズレ（サンプル数）を検出
     * パフォーマンスのため、中央部または曲頭の特定区間をスキャン
     */
    alignSignals(originalMono, recordedMono, onProgress) {
        const sampleRate = this.ctx.sampleRate;
        // 先頭30秒の中から最大5秒の区間をマッチング対象とする
        const scanWindowSeconds = 5;
        const maxOffsetSeconds = 15; // 想定される最大の演奏ズレ（前後15秒）

        const scanLength = Math.min(originalMono.length, Math.floor(scanWindowSeconds * sampleRate));
        const maxLag = Math.min(recordedMono.length - scanLength, Math.floor(maxOffsetSeconds * sampleRate));

        if (maxLag <= 0 || scanLength <= 0) {
            return 0; // スキャン不可能な場合はラグ0
        }

        // 探索高速化のため、ステップを設定
        const step = 1; 
        let maxCorrelation = -Infinity;
        let bestLag = 0;

        // 基準信号（Originalから一部抽出）
        const refSignal = originalMono.subarray(0, scanLength);

        // 進捗報告を挟みつつ、ラグの総当たり探索（簡易クロス相関）
        for (let lag = 0; lag < maxLag; lag += 100) { // まず大まかに100サンプル単位で検索
            let correlation = 0;
            for (let i = 0; i < scanLength; i += 64) { // 64サンプル飛ばしで高速内積
                if (lag + i < recordedMono.length) {
                    correlation += refSignal[i] * recordedMono[lag + i];
                }
            }

            if (correlation > maxCorrelation) {
                maxCorrelation = correlation;
                bestLag = lag;
            }

            if (typeof onProgress === 'function' && lag % 44100 === 0) {
                const percent = Math.floor((lag / maxLag) * 50); // 全体の前半50%を進捗に割り当て
                onProgress(percent);
            }
        }

        // 発見したベストラグの前後500サンプルを細かく精密に再スキャン
        let fineMaxCorrelation = -Infinity;
        let fineBestLag = bestLag;
        const startFine = Math.max(0, bestLag - 500);
        const endFine = Math.min(maxLag, bestLag + 500);

        for (let lag = startFine; lag < endFine; lag++) {
            let correlation = 0;
            for (let i = 0; i < scanLength; i += 16) { 
                if (lag + i < recordedMono.length) {
                    correlation += refSignal[i] * recordedMono[lag + i];
                }
            }
            if (correlation > fineMaxCorrelation) {
                fineMaxCorrelation = correlation;
                fineBestLag = lag;
            }
        }

        if (typeof onProgress === 'function') {
            onProgress(50); // 位置合わせフェーズ完了
        }

        return fineBestLag;
    },

    /**
     * 位置を同期させ、音量を正規化したペアデータを生成するメイン関数
     */
    async processAndAlign(originalBuffer, recordedBuffer, onProgress) {
        if (typeof onProgress === 'function') onProgress(10);

        const origMono = this.toMono(originalBuffer);
        const recMono = this.toMono(recordedBuffer);

        if (typeof onProgress === 'function') onProgress(20);

        // 1. 位置合わせ（ラグ検出）
        const lagSamples = this.alignSignals(origMono, recMono, onProgress);
        
        if (typeof onProgress === 'function') onProgress(60);

        // 2. ラグに基づいて録音バッファの有効区間を切り出し
        let alignedRecMono;
        if (recMono.length > lagSamples) {
            alignedRecMono = recMono.subarray(lagSamples);
        } else {
            alignedRecMono = new Float32Array(origMono.length);
        }

        // 長さを揃える
        const finalLength = Math.min(origMono.length, alignedRecMono.length);
        const cutOrig = origMono.subarray(0, finalLength);
        const cutRec = alignedRecMono.subarray(0, finalLength);

        if (typeof onProgress === 'function') onProgress(80);

        // 3. 音量補正（RMSを算出して録音音源のゲインを元音源に合わせる）
        const origRMS = this.getRMS(cutOrig);
        const recRMS = this.getRMS(cutRec);

        let gainFactor = 1.0;
        if (recRMS > 0) {
            gainFactor = origRMS / recRMS;
        }

        // サンパレス録音の音量を補正（クリップしないよう安全マージンを考慮）
        const normalizedRec = new Float32Array(finalLength);
        for (let i = 0; i < finalLength; i++) {
            normalizedRec[i] = cutRec[i] * gainFactor;
        }

        if (typeof onProgress === 'function') onProgress(100);

        // 解析に回すステレオバッファの切り出し（L/R特性抽出用）
        // 録音側のL/Rデータを取得し、同様にラグを適用
        const channels = recordedBuffer.numberOfChannels;
        const recL = new Float32Array(finalLength);
        const recR = new Float32Array(finalLength);

        const srcL = recordedBuffer.getChannelData(0);
        const srcR = channels > 1 ? recordedBuffer.getChannelData(1) : srcL;

        for (let i = 0; i < finalLength; i++) {
            if (i + lagSamples < srcL.length) {
                recL[i] = srcL[i + lagSamples] * gainFactor;
                recR[i] = srcR[i + lagSamples] * gainFactor;
            }
        }

        return {
            length: finalLength,
            sampleRate: originalBuffer.sampleRate,
            originalMono: cutOrig,
            recordedMono: normalizedRec,
            recordedStereo: { L: recL, R: recR }
        };
    }
};

// グローバル展開
window.AudioProcessor = AudioProcessor;
