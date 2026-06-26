// ================================
// graph.js
// 波形描画
// ================================

function drawWaveform(samples, canvasId){

    const canvas = document.getElementById(canvasId);

    if(!canvas) return;

    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0,0,width,height);

    // 背景
    ctx.fillStyle="#000";
    ctx.fillRect(0,0,width,height);

    // 中央線
    ctx.strokeStyle="#444";
    ctx.beginPath();
    ctx.moveTo(0,height/2);
    ctx.lineTo(width,height/2);
    ctx.stroke();

    ctx.strokeStyle="#00ff88";
    ctx.lineWidth=1;
    ctx.beginPath();

    const step=Math.ceil(samples.length/width);

    for(let x=0;x<width;x++){

        let min=1;
        let max=-1;

        const start=x*step;
        const end=Math.min(start+step,samples.length);

        for(let i=start;i<end;i++){

            const s=samples[i];

            if(s<min) min=s;
            if(s>max) max=s;

        }

        const y1=(1-max)*0.5*height;
        const y2=(1-min)*0.5*height;

        ctx.moveTo(x,y1);
        ctx.lineTo(x,y2);

    }

    ctx.stroke();

}
