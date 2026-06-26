/**
 * IR-Generator - wav.js
 * Float32Arrayオーディオデータから高品位 24bit PCM WAV バイナリへのエンコード処理
 */

const WAVEncoder = {
    /**
     * ステレオFloat32の左右データを、24bitステレオWAVのBlobに変換する
     */
    encode24BitWav(left, right, sampleRate) {
        const numChannels = 2;
        const bytesPerSample = 3; // 24bit = 3 bytes
        const numSamples = left.length;
        
        // データサイズ計算
        const subChunk2Size = numSamples * numChannels * bytesPerSample; // dataチャンクサイズ
        const chunkSize = 36 + subChunk2Size; // RIFFヘッダ全体のサイズ

        // バッファの確保 (ヘッダ44バイト + データサイズ)
        const buffer = new ArrayBuffer(44 + subChunk2Size);
        const view = new DataView(buffer);

        /* RIFF識別子 */
        this.writeString(view, 0, 'RIFF');
        /* 総ファイルサイズ - 8 */
        view.setUint32(4, chunkSize, true);
        /* WAVE識別子 */
        this.writeString(view, 8, 'WAVE');

        /* fmt チャンク識別子 */
        this.writeString(view, 12, 'fmt ');
        /* fmt チャンクサイズ (16固定) */
        view.setUint32(16, 16, true);
        /* 音声フォーマット (1 = 直線PCM) */
        view.setUint16(20, 1, true);
        /* チャンネル数 (2 = ステレオ) */
        view.setUint16(22, numChannels, true);
        /* サンプリングレート */
        view.setUint32(24, sampleRate, true);
        /* バイトレート (サンプルレート * チャンネル数 * バイト/サンプル) */
        view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
        /* ブロック境界 (チャンネル数 * バイト/サンプル) */
        view.setUint16(32, numChannels * bytesPerSample, true);
        /* サンプルあたりのビット数 (24bit) */
        view.setUint16(34, 24, true);

        /* data チャンク識別子 */
        this.writeString(view, 36, 'data');
        /* 波形データの総バイトサイズ */
        view.setUint32(40, subChunk2Size, true);

        /* 波形データの書き込み (インターリーブ: L, R, L, R...) */
        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
            // 左チャンネル (24bit化)
            this.write24BitSample(view, offset, left[i]);
            offset += 3;
            // 右チャンネル (24bit化)
            this.write24BitSample(view, offset, right[i]);
            offset += 3;
        }

        // ダウンロード可能なBlobオブジェクトにして返却
        return new Blob([buffer], { type: 'audio/wav' });
    },

    /**
     * 文字列をDataViewの指定オフセットにASCII書き込み
     */
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    },

    /**
     * -1.0〜1.0 のFloat32数値を、3バイト(24ビット)の符号付き整数にシリアライズ
     */
    write24BitSample(view, offset, sample) {
        // クリッピングの最終安全ガード
        let s = Math.max(-1, Math.min(1, sample));
        
        // 24bitの最大・最小値範囲にスケーリング（2^23 - 1 = 8388607）
        // 負の数の場合は補数を考慮するため、ビット演算用に整数化
        let pcm24 = s < 0 ? s * 0x800000 : s * 0x7FFFFF;
        pcm24 = Math.floor(pcm24);

        // リトルエンディアンで3バイトに分解して書き込む
        view.setUint8(offset, pcm24 & 0xFF);          // 下位バイト
        view.setUint8(offset + 1, (pcm24 >> 8) & 0xFF);  // 中位バイト
        view.setUint8(offset + 2, (pcm24 >> 16) & 0xFF); // 上位バイト
    }
};

window.WAVEncoder = WAVEncoder;
