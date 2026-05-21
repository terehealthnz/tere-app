/**
 * Tere Vitals — Proprietary rPPG Engine v2
 * Measures actual frame timestamps (not assumed 30fps)
 * Resamples to uniform grid before FFT
 * Hanning window, autocorrelation cross-check
 * Larger ROI sampling area
 * Clinical label: INDICATIVE SCREENING only
 */

const WINDOW_SEC  = 30
const RESAMPLE_FPS = 30
const HR_LOW_HZ   = 0.75
const HR_HIGH_HZ  = 3.5
const RR_LOW_HZ   = 0.13
const RR_HIGH_HZ  = 0.5

const ROI_LANDMARKS = [9,10,8,50,101,118,119,280,330,347,348,168,6,197]

let faceMeshInstance = null
let faceMeshReady    = false

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src; s.crossOrigin = 'anonymous'
    s.onload = resolve; s.onerror = () => reject(new Error(`Failed: ${src}`))
    document.head.appendChild(s)
  })
}

export async function loadFaceMesh() {
  if (faceMeshReady) return faceMeshInstance
  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js')
  return new Promise((resolve, reject) => {
    const mesh = new FaceMesh({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${f}`
    })
    mesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 })
    mesh.onResults(r => { if (faceMeshInstance) faceMeshInstance._latest = r })
    mesh.initialize().then(() => { faceMeshInstance=mesh; faceMeshReady=true; resolve(mesh) }).catch(reject)
  })
}

function mean(a) { return a.reduce((s,v)=>s+v,0)/a.length }
function std(a)  { const m=mean(a); return Math.sqrt(mean(a.map(v=>(v-m)**2))) }
function hanning(n) { return Array.from({length:n},(_,i)=>0.5*(1-Math.cos(2*Math.PI*i/(n-1)))) }
function detrend(a) {
  const n=a.length; if(n<2) return a
  const xm=(n-1)/2, ym=mean(a)
  const slope=a.reduce((s,v,i)=>s+(i-xm)*(v-ym),0)/a.reduce((s,_,i)=>s+(i-xm)**2,0)
  return a.map((v,i)=>v-(slope*(i-xm)+ym))
}

function resample(values, timestamps, targetFps) {
  if (values.length<2) return values
  const tStart=timestamps[0], tEnd=timestamps[timestamps.length-1], dt=1000/targetFps
  const out=[]; let j=0
  for (let t=tStart; t<=tEnd; t+=dt) {
    while (j<timestamps.length-2 && timestamps[j+1]<t) j++
    const t0=timestamps[j],t1=timestamps[j+1]||timestamps[j]
    const v0=values[j],v1=values[j+1]||values[j]
    const a=t1>t0?(t-t0)/(t1-t0):0
    out.push(v0+a*(v1-v0))
  }
  return out
}

function nextPow2(n) { let p=1; while(p<n) p*=2; return p }

function fftMagnitudes(signal) {
  const n=nextPow2(signal.length)
  const win=hanning(signal.length)
  const re=[...signal.map((v,i)=>v*win[i]),...new Array(n-signal.length).fill(0)]
  const im=new Array(n).fill(0)
  for (let i=1,j=0;i<n;i++) {
    let bit=n>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit
    if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}
  }
  for (let len=2;len<=n;len<<=1) {
    const ang=-2*Math.PI/len,wR=Math.cos(ang),wI=Math.sin(ang)
    for (let i=0;i<n;i+=len) {
      let cR=1,cI=0
      for (let j=0;j<len/2;j++) {
        const uR=re[i+j],uI=im[i+j],vR=re[i+j+len/2]*cR-im[i+j+len/2]*cI,vI=re[i+j+len/2]*cI+im[i+j+len/2]*cR
        re[i+j]=uR+vR;im[i+j]=uI+vI;re[i+j+len/2]=uR-vR;im[i+j+len/2]=uI-vI
        const nR=cR*wR-cI*wI;cI=cR*wI+cI*wR;cR=nR
      }
    }
  }
  return {mags:re.map((_,i)=>Math.sqrt(re[i]**2+im[i]**2)), n}
}

function dominantFreq(signal, lowHz, highHz, fs) {
  const {mags,n}=fftMagnitudes(signal)
  const freqRes=fs/n
  let maxAmp=0,domFreq=0
  for (let i=1;i<n/2;i++) {
    const freq=i*freqRes
    if(freq<lowHz||freq>highHz) continue
    if(mags[i]>maxAmp){maxAmp=mags[i];domFreq=freq}
  }
  return domFreq
}

function autocorrPeak(signal, lowHz, highHz, fs) {
  const n=signal.length
  const minLag=Math.floor(fs/highHz), maxLag=Math.floor(fs/lowHz)
  let bestLag=0,bestVal=-Infinity
  for (let lag=minLag;lag<=maxLag&&lag<n;lag++) {
    let sum=0; for(let i=0;i<n-lag;i++) sum+=signal[i]*signal[i+lag]
    if(sum>bestVal){bestVal=sum;bestLag=lag}
  }
  return bestLag>0?fs/bestLag:0
}

function posAlgorithm(rgb, windowSize=48) {
  const n=rgb.length; if(n<windowSize*2) return new Array(n).fill(0)
  const H=new Array(n).fill(0)
  for (let t=windowSize;t<n;t++) {
    const win=rgb.slice(t-windowSize,t)
    const mR=mean(win.map(f=>f[0])),mG=mean(win.map(f=>f[1])),mB=mean(win.map(f=>f[2]))
    if(mR<1||mG<1||mB<1) continue
    const norm=win.map(f=>[f[0]/mR,f[1]/mG,f[2]/mB])
    const S1=norm.map(f=>f[1]-f[2]),S2=norm.map(f=>f[1]+f[2]-2*f[0])
    const sS2=std(S2); if(sS2<1e-6) continue
    H[t]=S1[S1.length-1]+(std(S1)/sS2)*S2[S2.length-1]
  }
  return H
}

function sampleROI(canvas, landmarks, w, h) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true}); if(!ctx) return null
  let tR=0,tG=0,tB=0,count=0
  ROI_LANDMARKS.forEach(idx => {
    const lm=landmarks[idx]; if(!lm) return
    const x=Math.round(lm.x*w),y=Math.round(lm.y*h)
    const px=Math.max(0,x-7),py=Math.max(0,y-7)
    const pw=Math.min(14,w-px),ph=Math.min(14,h-py)
    if(pw<=0||ph<=0) return
    const data=ctx.getImageData(px,py,pw,ph).data
    for(let i=0;i<data.length;i+=4){tR+=data[i];tG+=data[i+1];tB+=data[i+2];count++}
  })
  return count>0?[tR/count,tG/count,tB/count]:null
}

export class RppgMeasurement {
  constructor(onProgress, onComplete, onError) {
    this.onProgress=onProgress; this.onComplete=onComplete; this.onError=onError
    this.rgbBuffer=[]; this.timestamps=[]; this.rafId=null
    this.videoEl=null; this.canvasEl=null; this.mesh=null
    this.running=false; this.startTime=null; this.missedFrames=0
  }

  async start(videoEl, canvasEl) {
    this.videoEl=videoEl; this.canvasEl=canvasEl
    this.running=true; this.rgbBuffer=[]; this.timestamps=[]
    this.startTime=performance.now(); this.missedFrames=0
    try { this.mesh=await loadFaceMesh() }
    catch(e) { this.onError('Could not load face detection. Check your connection and try again.'); return }
    this._tick()
  }

  async _tick() {
    if(!this.running) return
    const now=performance.now()
    const elapsed=(now-this.startTime)/1000
    const pct=Math.min(100,Math.round((elapsed/WINDOW_SEC)*100))
    const ctx=this.canvasEl.getContext('2d')
    ctx.drawImage(this.videoEl,0,0,this.canvasEl.width,this.canvasEl.height)
    try {
      await this.mesh.send({image:this.canvasEl})
      const results=this.mesh._latest
      if(results?.multiFaceLandmarks?.[0]) {
        const rgb=sampleROI(this.canvasEl,results.multiFaceLandmarks[0],this.canvasEl.width,this.canvasEl.height)
        if(rgb){this.rgbBuffer.push(rgb);this.timestamps.push(now)}
        else this.missedFrames++
      } else this.missedFrames++
    } catch {}

    if(this.timestamps.length>1) {
      const dur=(this.timestamps[this.timestamps.length-1]-this.timestamps[0])/1000
      if(dur>=5&&this.rgbBuffer.length>=60) {
        try {
          const relTs=this.timestamps.map(t=>t-this.timestamps[0])
          const rs=resample(posAlgorithm(this.rgbBuffer),relTs,RESAMPLE_FPS)
          const hz=dominantFreq(detrend(rs),HR_LOW_HZ,HR_HIGH_HZ,RESAMPLE_FPS)
          this.onProgress(pct, hz>0?Math.round(hz*60):null)
        } catch { this.onProgress(pct,null) }
      } else this.onProgress(pct,null)
    } else this.onProgress(pct,null)

    if(elapsed>=WINDOW_SEC){this.stop();this._calculate();return}
    this.rafId=requestAnimationFrame(()=>this._tick())
  }

  _calculate() {
    if(this.rgbBuffer.length<60){this.onError('Not enough frames. Ensure your face is well lit and stay still.');return}
    try {
      const ms=this.timestamps[this.timestamps.length-1]-this.timestamps[0]
      const actualFps=(this.timestamps.length/ms*1000)
      console.log(`Tere Vitals: ${this.rgbBuffer.length} frames, ${actualFps.toFixed(1)}fps`)
      const relTs=this.timestamps.map(t=>t-this.timestamps[0])
      const resampled=resample(posAlgorithm(this.rgbBuffer),relTs,RESAMPLE_FPS)
      const det=detrend(resampled)
      const hrFft=dominantFreq(det,HR_LOW_HZ,HR_HIGH_HZ,RESAMPLE_FPS)
      const hrAuto=autocorrPeak(det,HR_LOW_HZ,HR_HIGH_HZ,RESAMPLE_FPS)
      const hrFftBpm=hrFft>0?Math.round(hrFft*60):null
      const hrAutoBpm=hrAuto>0?Math.round(hrAuto*60):null
      let hr=hrFftBpm
      if(hrFftBpm&&hrAutoBpm&&Math.abs(hrFftBpm-hrAutoBpm)<10) hr=Math.round((hrFftBpm+hrAutoBpm)/2)
      const rrHz=dominantFreq(det,RR_LOW_HZ,RR_HIGH_HZ,RESAMPLE_FPS)
      const rr=rrHz>0?Math.round(rrHz*60):null
      const finalHR=hr&&hr>=40&&hr<=200?hr:null
      const finalRR=rr&&rr>=8&&rr<=35?rr:null
      const agreement=hrFftBpm&&hrAutoBpm?Math.abs(hrFftBpm-hrAutoBpm):99
      const confidence=agreement<5?'high':agreement<10?'moderate':'low'
      const missRate=this.missedFrames/(this.rgbBuffer.length+this.missedFrames)
      this.onComplete({
        hr:finalHR, rr:finalRR, confidence,
        frames:this.rgbBuffer.length, actualFps:parseFloat(actualFps.toFixed(1)),
        faceWarning:missRate>0.3,
        note:'Indicative screening only — not a substitute for medical-grade devices.',
      })
    } catch(e) {
      console.error('rPPG error:',e)
      this.onError('Calculation error. Try again with better lighting.')
    }
  }

  stop() { this.running=false; if(this.rafId) cancelAnimationFrame(this.rafId) }
}
