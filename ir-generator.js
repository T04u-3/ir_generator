/**
 * IR-Generator - ir-generator.js
 * 解析パラメータに基づく高品位インパルス応答（IR）のステレオ合成アルゴリズム
 */

const IRGenerator = {
    /**
     * パラメータからIR（AudioBufferと同等のFloat32Array構造）を合成する
     */
    generate(analysisData, userParams) {
        const sampleRate = parseInt(userParams.sampleRate, 10) || 44100;
        
        // ユーザー調整倍率を適用
        const adjustedRt60 = analysisData.rt60 * userParams.rtScale;
        const hfDampFactor = userParams.hfDamp;

        // 総サンプル数の決定（RT60の長さ + 安全マージン0.5秒）
        const totalDuration = adjustedRt60 + 0.5;
        const totalSamples = Math.floor(totalDuration * sampleRate);

        const irLeft = new Float32Array(totalSamples);
        const irRight = new Float32Array(totalSamples);

        // 1. 初期反射音 (Early Reflections) の配置
        this.generateEarlyReflections(irLeft, irRight, analysisData.earlyReflections, sampleRate, analysisData.stereoWidth);

        // 2. 後期残響 (Late Reverb Tail) の合成
        this.generateLateReverb(irLeft, irRight, totalSamples, adjustedRt60, hfDampFactor, sampleRate, analysisData);

        // 3. 5バンドEQの周波数プロファイル適用
        this.applyEQProfile(irLeft, irRight, sampleRate, analysisData.eq);

        // 4. クリップ防止のためのノーマライズ（最大振幅を-1dB = 約0.89に調整）
        this.normalizeIR(irLeft, irRight);

        return {
            sampleRate: sampleRate,
            left: irLeft,
            right: irRight,
            length: totalSamples
        };
    },

    /**
     * 緻密な初期反射音の生成
     */
    generateEarlyReflections(left, right, erData, sampleRate, stereoWidth) {
        const baseDelaySamples = Math.floor((erData.delayMs / 1000) * sampleRate);
        const baseGain = erData.gain;

        // メインの第1反射
        if (baseDelaySamples < left.length) {
            left[baseDelaySamples] = baseGain;
            // ステレオ幅を考慮して右チャンネルのディレイを数ミリ秒散らす（ハース効果）
            const rightDelay = Math.floor(baseDelaySamples + (sampleRate * 0.002 * (stereoWidth / 100)));
            if (rightDelay < right.length) {
                right[rightDelay] = baseGain * 0.9;
            }
        }

        // 密度を高めるための二次・三次反射の疑似配置
        const reflections = [
            { delayMul: 1.4, gainMul: 0.7, side: 'L' },
            { delayMul: 1.8, gainMul: 0.5, side: 'R' },
            { delayMul: 2.3, gainMul: 0.4, side: 'L' },
            { delayMul: 2.9, gainMul: 0.2, side: 'R' }
        ];

        reflections.forEach(rf => {
            const delay = Math.floor(baseDelaySamples * rf.delayMul);
            if (delay < left.length) {
                if (rf.side === 'L') {
                    left[delay] += baseGain * rf.gainMul;
                    right[Math.min(right.length - 1, delay + 50)] += baseGain * rf.gainMul * 0.5;
                } else {
                    right[delay] += baseGain * rf.gainMul;
                    left[Math.min(left.length - 1, delay + 70)] += baseGain * rf.gainMul * 0.5;
                }
            }
        });
    },

    /**
     * 周波数依存の減衰を伴う指数関数後期残響の生成
     */
    generateLateReverb(left, right, totalSamples, rt60, hfDamp, sampleRate, analysisData) {
        const startLateSamples = Math.floor(sampleRate * 0.04); // 後期残響の開始（約40ms〜）
        
        // RT60は-60dB（振幅0.001）になる時間。減衰定数（タウ）を計算
        // 振幅エンベロープ: A(t) = exp(-t / tau) => exp(-rt60 / tau) = 0.001 => tau = rt60 / ln(1000)
        const tau = rt60 / Math.log(1000);
        
        // 左右の無相関化（独立したホワイトノイズ）
        // ワンポールフィルターの状態保持変数
        let lpStateL = 0;
        let lpStateR = 0;

        for (let i = startLateSamples; i < totalSamples; i++) {
            const t = (i - startLateSamples) / sampleRate;
            
            // 指数減衰エンベロープ
            const envelope = Math.exp(-t / tau);
            if (envelope < 0.0001) break; // 十分に減衰したら打ち切り

            // ホワイトノイズ生成 (-1.0 〜 1.0)
            const noiseL = Math.random() * 2 - 1;
            const noiseTextR = Math.random() * 2 - 1;

            // 残響密度とステレオ幅を加味してL/Rを混合（広がり感の構築）
            const mixFactor = (analysisData.stereoWidth / 100) * 0.5; // 最大0.5
            const finalNoiseL = noiseL * (1 - mixFactor) + noiseTextR * mixFactor;
            const finalNoiseR = noiseTextR * (1 - mixFactor) + noiseL * mixFactor;

            // 時間経過に伴う高域減衰（ワンポール・ローパスフィルター）
            // 時間 t が進むほど、あるいは hfDamp が大きいほど、平滑化係数 alpha が小さくなり高域が削られる
            const targetCutoff = 8000 * Math.exp(-t * 0.8 * hfDamp); // 高域の溶け込み
            const normalizedFreq = Math.max(0.005, Math.min(0.99, targetCutoff / (sampleRate / 2)));
            const alpha = normalizedFreq; // 簡易フィルター係数

            lpStateL = alpha * finalNoiseL + (1 - alpha) * lpStateL;
            lpStateR = alpha * finalNoiseR + (1 - alpha) * lpStateR;

            // 初期反射エリアとの滑らかなクロスフェード接続
            let fadeIn = 1.0;
            if (t < 0.03) {
                fadeIn = t / 0.03; // 最初30msで後期残響をフェードイン
            }

            left[i] += lpStateL * envelope * fadeIn * 0.35 * analysisData.density;
            right[i] += lpStateR * envelope * fadeIn * 0.35 * analysisData.density;
        }
    },

    /**
     * 5バンド簡易イコライザー（FIR/IIRの代替としての時間ドメインへの簡易フィルターアプローチ）
     * 安定かつ高速処理のため、カスケード型の3バンド/5バンド並列簡易シェルビングで周波数特性を反映
     */
    applyEQProfile(left, right, sampleRate, eq) {
        // eq.low, eq.lmid, eq.mid, eq.hmid, eq.high (dB単位)
        // ゲイン倍率に変換
        const gLow  = Math.pow(10, eq.low / 20);
        const gMid  = Math.pow(10, eq.mid / 20);
        const gHigh = Math.pow(10, eq.high / 20);

        // 超簡易型3バンドスプリットフィルター（定数係数でのスムージング）
        let xl_L = 0, xh_L = 0, xl_R = 0, xh_R = 0;
        
        // クロスオーバー係数 (Low: ~300Hz, High: ~5kHz)
        const alphaL = 0.04;
        const alphaH = 0.4;

        for (let i = 0; i < left.length; i++) {
            // 左チャンネル
            const sampleL = left[i];
            xl_L = alphaL * sampleL + (1 - alphaL) * xl_L; // ローパス成分
            xh_L = alphaH * sampleL + (1 - alphaH) * xh_L; // 
            const highComponentL = sampleL - xh_L;          // ハイパス成分
            const midComponentL  = xh_L - xl_L;             // バンドパス成分

            left[i] = (xl_L * gLow) + (midComponentL * gMid) + (highComponentL * gHigh);

            // 右チャンネル
            const sampleR = right[i];
            xl_R = alphaL * sampleR + (1 - alphaL) * xl_R;
            xh_R = alphaH * sampleR + (1 - alphaH) * xh_R;
            const highComponentR = sampleR - xh_R;
            const midComponentR  = xh_R - xl_R;

            right[i] = (xl_R * gLow) + (midComponentR * gMid) + (highComponentR * gHigh);
        }
    },

    /**
     * ピークレベルの正規化
     */
    normalizeIR(left, right) {
        let maxAmp = 0;
        const len = left.length;

        // 最大絶対値の探索
        for (let i = 0; i < len; i++) {
            const absL = Math.abs(left[i]);
            const absR = Math.abs(right[i]);
            if (absL > maxAmp) maxAmp = absL;
            if (absR > maxAmp) maxAmp = absR;
        }

        // 安全な最大振幅にスケーリング
        if (maxAmp > 0) {
            const targetMax = 0.89; // -1dBFSマージン
            const scale = targetMax / maxAmp;
            for (let i = 0; i < len; i++) {
                left[i] *= scale;
                right[i] *= scale;
            }
        }
    }
};

window.IRGenerator = IRGenerator;
