import {getDocument,GlobalWorkerOptions} from '../vendor/pdfjs/pdf.min.mjs';
GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;

export async function extractResume(bytes) {
  // Bytes only: never let a PDF cause remote font/CMap/WASM requests or eval.
  const task=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true,disableFontFace:true,
    useWorkerFetch:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,useWasm:false,verbosity:0});
  const timer=setTimeout(()=>task.destroy(),20000);
  try {
    const pdf=await task.promise;
    if (pdf.numPages>10) throw new Error('This PDF has more than 10 pages. Use a shorter résumé, or paste selected highlights.');
    const pages=[];
    for (let number=1;number<=pdf.numPages;number++) {
      const content=await (await pdf.getPage(number)).getTextContent();
      let line='',previousY=null;const lines=[];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y=item.transform?.[5];
        if (previousY!==null && Math.abs(y-previousY)>3 && line.trim()) {lines.push(line.trim());line='';}
        line+=`${item.str} `;previousY=y;
        if (item.hasEOL && line.trim()) {lines.push(line.trim());line='';previousY=null;}
      }
      if (line.trim()) lines.push(line.trim());
      pages.push(lines.join('\n'));
    }
    const text=pages.join('\n\n').replace(/[ \t]+/g,' ').trim();
    if (text.length<40) throw new Error('No usable text found. This may be a scanned PDF; paste relevant skills or projects into highlights.');
    if (text.length>40000) throw new Error('Too much text to review safely. Use a shorter résumé or paste selected highlights.');
    // Join wrapped sentences so a selected evidence line is not half a claim.
    const paragraphs=[];
    for (const line of text.split('\n').map(value=>value.trim()).filter(Boolean)) {
      const previous=paragraphs[paragraphs.length-1];
      if (previous && /^[a-z]/.test(line) && previous.length+line.length<700) {
        paragraphs[paragraphs.length-1]=/[a-z]-$/.test(previous) ? previous.slice(0,-1)+line : previous+' '+line;
      } else paragraphs.push(line);
    }
    const candidates=[...new Set(paragraphs.filter(line=>line.length>=18 && line.length<=700 && !/@|https?:|www\.|\+?\d[\d ()-]{8,}\d/.test(line)))].slice(0,80);
    return {text,candidates,pages:pdf.numPages};
  } finally {clearTimeout(timer);await task.destroy();}
}
