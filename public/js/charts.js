(() => {
  const { $,timestamp,number,ping }=ZM;
  let samples=[],current=null,period='24h',range=null;
  const ns='http://www.w3.org/2000/svg', W=520,H=160,left=30,right=485,top=12,bottom=132;
  function element(tag,attrs,text) {
    const node=document.createElementNS(ns,tag);
    for(const [name,value] of Object.entries(attrs)) node.setAttribute(name,String(value));
    if(text!==undefined) node.textContent=text;
    return node;
  }
  function renderChart(history) {
    samples=history.samples;period=history.period;range=[Date.parse(history.from),Date.parse(history.to)];
    const svg=$('chart'); svg.replaceChildren();
    $('chart-empty').hidden=samples.length>0;
    if (!samples.length) { current=null; $('chart-tooltip').hidden=true; }
    const playerMax=Math.max(5,...samples.map(s=>s.avgPlayers ?? 0));
    const pingMax=Math.max(100,...samples.map(s=>s.avgPing ?? 0));
    const pMax=Math.ceil(playerMax/5)*5,qMax=Math.ceil(pingMax/50)*50;
    const x=sample=>left+(Date.parse(sample.createdAt)-range[0])/(range[1]-range[0])*(right-left);
    for(let i=0;i<=3;i++) {
      const y=bottom-i/3*(bottom-top);
      svg.append(element('line',{x1:left,x2:right,y1:y,y2:y,class:'chart-grid'}));
      svg.append(element('text',{x:left-6,y:y+3,'text-anchor':'end',class:'chart-axis'},Math.round(pMax*i/3)));
      svg.append(element('text',{x:right+6,y:y+3,class:'chart-axis'},Math.round(qMax*i/3)));
    }
    for(let i=0;i<=4;i++) {
      const px=left+i/4*(right-left), date=new Date(range[0]+i/4*(range[1]-range[0]));
      const label=period==='24h' ? date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
      svg.append(element('text',{x:px,y:151,'text-anchor':'middle',class:'chart-axis'},label));
    }
    const width=Math.max(.7,Math.min(18,history.bucketSeconds*1000/(range[1]-range[0])*(right-left)*.75));
    let commands='',previous=null;
    for(const sample of samples) {
      const px=Math.max(left,Math.min(right,x(sample)));
      if(sample.avgPlayers!=null) {
        const height=sample.avgPlayers/pMax*(bottom-top);
        svg.append(element('rect',{x:px-width/2,y:bottom-height,width,height,class:'chart-bar',rx:1}));
      }
      if(sample.avgPing!=null) {
        const y=bottom-sample.avgPing/qMax*(bottom-top);
        const gap=previous===null || Date.parse(sample.createdAt)-Date.parse(previous.createdAt)>history.bucketSeconds*1500;
        commands+=`${gap ? 'M' : 'L'}${px.toFixed(2)},${y.toFixed(2)} `;
        if(samples.length<50)svg.append(element('circle',{cx:px,cy:y,r:1.8,class:'chart-dot'}));
        previous=sample;
      } else previous=null;
    }
    svg.append(element('path',{d:commands,class:'chart-line'}));
    svg.append(element('line',{id:'chart-cursor',x1:left,x2:left,y1:top,y2:bottom,class:'chart-cursor',visibility:'hidden'}));
    if(current!=null)showTooltip(Math.min(current,samples.length-1));
  }
  function showTooltip(index) {
    if(index<0 || !samples.length) return;
    current=index;const s=samples[index],tip=$('chart-tooltip');
    tip.textContent=`${timestamp(s.createdAt)}\nPlayers: ${number(s.avgPlayers)} · Ping: ${ping(s.avgPing)}\nChecks: ${s.checks} · Failures: ${s.failedChecks}`;tip.hidden=false;
    const x=left+(Date.parse(s.createdAt)-range[0])/(range[1]-range[0])*(right-left);
    const cursor=$('chart-cursor');cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);cursor.setAttribute('visibility','visible');
  }
  function setupChart() {
    const chart=$('chart');chart.setAttribute('tabindex','0');
    chart.setAttribute('aria-label','Player count bars and ping line. Use arrow keys to inspect historical samples.');
    const inspectPointer=event=>{
      if(!samples.length)return;const rect=chart.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*W;
      const target=range[0]+(x-left)/(right-left)*(range[1]-range[0]);
      let index=0;for(let i=1;i<samples.length;i++)if(Math.abs(Date.parse(samples[i].createdAt)-target)<Math.abs(Date.parse(samples[index].createdAt)-target))index=i;
      showTooltip(index);
    };
    chart.addEventListener('pointermove',inspectPointer);
    chart.addEventListener('pointerdown',inspectPointer);
    chart.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch'){current=null;$('chart-tooltip').hidden=true;$('chart-cursor')?.setAttribute('visibility','hidden');}});
    chart.addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();showTooltip(Math.max(0,Math.min(samples.length-1,(current ?? 0)+(event.key==='ArrowRight'?1:-1))));}
      if(event.key==='Escape'){current=null;$('chart-tooltip').hidden=true;}
    });
  }
  Object.assign(ZM,{renderChart,setupChart});
})();
