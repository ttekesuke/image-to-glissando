const { createApp, ref, nextTick } = Vue;

createApp({
    setup() {
        const sourceImage=ref(null), imageState=ref(null), stats=ref(null);
        const extractionMode=ref('edge');
        const threshold=ref(128), autoThreshold=ref(128);
        const edgeThreshold=ref(48), blurRadius=ref(1), minTraceLength=ref(12), simplifyTolerance=ref(1.5);
        const fileInput=ref(null), originalCanvas=ref(null), segmentCanvas=ref(null), edgeCanvas=ref(null), vexflowContainer=ref(null), scoreViewport=ref(null);
        let extractionCache=null, previewTimer=null;

        function handleFileSelect(event) {
            const f=event.target.files[0];
            if (f) processFile(f);
        }
        function handleDrop(event) {
            const f=event.dataTransfer.files[0];
            if (f && f.type.startsWith('image/')) processFile(f);
        }
        function processFile(file) {
            const reader=new FileReader();
            reader.onload=(e)=>{
                const img=new Image();
                img.onload=async()=>{
                    sourceImage.value=img;
                    await nextTick();
                    prepareImageState(img);
                    stats.value=null;
                    if (vexflowContainer.value) vexflowContainer.value.innerHTML='';
                    extractionCache=null;
                    scheduleExtractionPreview();
                };
                img.src=e.target.result;
            };
            reader.readAsDataURL(file);
        }
        function prepareImageState(img) {
            const srcW=img.naturalWidth||img.width, srcH=img.naturalHeight||img.height;
            const temp=document.createElement('canvas'); temp.width=srcW; temp.height=srcH;
            const ctx=temp.getContext('2d'); ctx.drawImage(img,0,0,srcW,srcH);
            const data=ctx.getImageData(0,0,srcW,srcH).data;
            const gray=new Float32Array(srcW*srcH);
            for (let i=0;i<gray.length;i++) gray[i]=0.299*data[i*4]+0.587*data[i*4+1]+0.114*data[i*4+2];
            imageState.value={img,srcW,srcH,gray};
            const t=ImageGlissExtractor.otsu(gray); autoThreshold.value=t; threshold.value=t;
            drawOriginal(img,srcW,srcH);
        }
        function drawOriginal(img,w,h) {
            const a=originalCanvas.value,b=segmentCanvas.value,c=edgeCanvas.value;
            if (!a||!b||!c) return;
            for (const cv of [a,b,c]) { cv.width=w; cv.height=h; }
            const ctx=a.getContext('2d'); ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
            b.getContext('2d').clearRect(0,0,w,h);
        }
        function extractionKey() {
            return [extractionMode.value,threshold.value,edgeThreshold.value,blurRadius.value,minTraceLength.value,simplifyTolerance.value].join(':');
        }
        function runExtraction() {
            const state=imageState.value;
            if (!state) return {traces:[],mask:new Uint8Array(0)};
            const key=extractionKey();
            if (extractionCache && extractionCache.key===key) return extractionCache.result;
            const result=ImageGlissExtractor.extract(state.gray,state.srcW,state.srcH,{
                mode:extractionMode.value,
                threshold:Number(threshold.value),
                edgeThreshold:Number(edgeThreshold.value),
                blurRadius:Number(blurRadius.value),
                minTraceLength:Number(minTraceLength.value),
                simplifyTolerance:Number(simplifyTolerance.value)
            });
            extractionCache={key,result};
            return result;
        }
        function drawMask(mask,w,h) {
            const cv=edgeCanvas.value; if (!cv) return;
            cv.width=w; cv.height=h;
            const ctx=cv.getContext('2d'), out=ctx.createImageData(w,h);
            for (let i=0;i<mask.length;i++) { const v=mask[i]?255:0; out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v; out.data[i*4+3]=255; }
            ctx.putImageData(out,0,0);
        }
        function drawTraces(traces) {
            const state=imageState.value,cv=segmentCanvas.value; if (!state||!cv) return;
            const ctx=cv.getContext('2d'); ctx.clearRect(0,0,state.srcW,state.srcH);
            ctx.strokeStyle='red'; ctx.lineWidth=Math.max(1,Math.min(state.srcW,state.srcH)/300); ctx.lineJoin='round'; ctx.lineCap='round';
            for (const pts of traces) {
                if (!pts||pts.length<2) continue;
                ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
                for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
                ctx.stroke();
            }
        }
        function updateExtractionPreview() {
            const state=imageState.value; if (!state) return;
            extractionCache=null;
            const result=runExtraction();
            drawMask(result.mask,state.srcW,state.srcH);
            drawTraces(result.traces);
        }
        function scheduleExtractionPreview() {
            if (previewTimer) clearTimeout(previewTimer);
            previewTimer=setTimeout(()=>{ previewTimer=null; updateExtractionPreview(); },60);
        }
        async function renderScoreFromCurrentImage() {
            const state=imageState.value; if (!state) return;
            if (previewTimer) { clearTimeout(previewTimer); previewTimer=null; updateExtractionPreview(); }
            await nextTick();
            const result=runExtraction();
            const score=ImageGlissScoreConvert.convert(result.traces,state.srcW,state.srcH,segmentCanvas.value);
            if (!score) return;
            stats.value=score.stats;
            ImageGlissScoreRender.render(score,vexflowContainer.value,scoreViewport.value);
        }
        async function saveScoreAsPng() {
            await ImageGlissScoreRender.savePng(vexflowContainer.value);
        }
        return {sourceImage,stats,fileInput,originalCanvas,segmentCanvas,edgeCanvas,vexflowContainer,scoreViewport,
            extractionMode,threshold,autoThreshold,edgeThreshold,blurRadius,minTraceLength,simplifyTolerance,
            handleFileSelect,handleDrop,scheduleExtractionPreview,renderScoreFromCurrentImage,saveScoreAsPng};
    }
}).mount('#app');
