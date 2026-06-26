// =========================
// deconvolution.js
// Part 1
// =========================


//--------------------------------------
// RMS
//--------------------------------------

function calculateRMS(samples){

    let sum=0;

    for(let i=0;i<samples.length;i++){

        sum+=samples[i]*samples[i];

    }

    return Math.sqrt(sum/samples.length);

}



//--------------------------------------
// 音量を合わせる
//--------------------------------------

function normalizeLevel(original,recorded){

    const rmsOriginal=
    calculateRMS(original);

    const rmsRecorded=
    calculateRMS(recorded);

    const gain=
    rmsOriginal/rmsRecorded;

    const result=
    new Float32Array(recorded.length);

    for(let i=0;i<recorded.length;i++){

        result[i]=recorded[i]*gain;

    }

    return result;

}



//--------------------------------------
// 相互相関
//--------------------------------------

function crossCorrelation(a,b,maxShift=44100){

    let bestShift=0;

    let bestScore=-Infinity;

    for(let shift=-maxShift;
        shift<=maxShift;
        shift++){

        let score=0;

        for(let i=0;i<a.length;i++){

            const j=i+shift;

            if(
                j<0||
                j>=b.length
            ) continue;

            score+=
            a[i]*b[j];

        }

        if(score>bestScore){

            bestScore=score;

            bestShift=shift;

        }

    }

    return bestShift;

}



//--------------------------------------
// 自動位置合わせ
//--------------------------------------

function alignSignals(original,recorded){

    const shift=
    crossCorrelation(original,recorded);

    console.log(
        "Shift:",
        shift
    );

    if(shift>0){

        return recorded.slice(shift);

    }

    if(shift<0){

        const result=
        new Float32Array(
            recorded.length-shift
        );

        result.set(
            recorded,
            -shift
        );

        return result;

    }

    return recorded;

}



//--------------------------------------
// 前処理
//--------------------------------------

function preprocessAudio(original,recorded){

    let aligned=
    alignSignals(
        original,
        recorded
    );

    aligned=
    normalizeLevel(
        original,
        aligned
    );

    return aligned;

}
