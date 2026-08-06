/* 自動抽取,請勿手動編輯。
   來源:commit 4916c0a 的 index.html <script> 區塊(重構為共用引擎之前)。
   用途:平價測試的凍結參照——證明重構後的決策與此完全相同。
   重新產生:node test/tools/freeze-legacy.js */
"use strict";
const D_RETS=[-0.202191, -0.15421, 0.058784, 0.122059, 0.015082, 0.10171, 0.155972, 0.0238, 0.010674, 0.03, -0.114389, 0.071707, 0.005701, 0.013137, -0.000609, -0.063251, 0.170326, 0.052657, 0.01367, -0.021859, -0.079086, 0.004245, -0.07001, -0.000792, -0.020651, 0.016877, 0.020056, 0.058392, -0.004357, 0.016386, 0.011285, 0.046287, -0.045907, 0.057916, -0.027743, -0.022311, 0.064683, 0.004516, 0.025809, -0.008384, 0.131644, 0.091507, -0.035005, -0.102505, -0.000367, 0.021408, -0.028057, 0.034334, 0.051195, -0.036229, 0.028004, -0.050814, 0.014356, -0.037978, 0.049422, 0.01808, 0.029751, 0.02897, 0.06442, 0.079222, 0.008319, 0.027776, 0.000776, 0.002217, 0.012116, 0.012795, 0.049557, 0.003143, 0.145158, 0.024476, 0.002519, -0.099684, 0.035663, 0.11771, 0.002155, 0.119765, -0.026286, 0.126288, -0.04107, -0.067036, 0.129015, 0.090377, 0.044489, 0.18471, -0.079757, 0.001676, -0.112987, 0.025594, -0.047149, 0.058539, 0.152107, 0.022037, -0.005724, -0.064418, 0.08836, 0.021726, -0.23299, 0.104758, 0.031678, 0.126957, 0.143009, 0.142702, -0.098267, 0.134216, 0.025032, -0.030953, 0.142322, -0.043803, 0.054438, -0.024336, 0.091247, 0.123288, 0.26262, -0.018111, 0.157966, 0.05027, -0.1841, -0.127249, 0.103584, -0.079127, 0.117628, -0.169546, -0.123601, -0.121891, -0.043302, 0.067123, -0.108077, -0.053628, 0.036234, -0.018857, -0.017541, -0.039157, -0.036548, -0.063124, 0.026358, 0.043574, 0.017918, -0.002216, -0.010646, 0.022905, -0.019934, -0.013019, -0.035786, -0.027075, -0.002008, -0.028627, 0.013642, 0.020996, -0.015541, 0.00261, -0.008325, -0.005676, 0.004688, 0.140979, 0.061127, 0.088241, 0.097575, -0.038309, 0.13173, -0.014986, 0.080127, 0.033048, 0.005753, -0.025394, -0.046255, 0.009532, 0.043907, -0.103804, -0.015413, 0.034867, 0.045491, 0.087295, 0.069417, -0.082645, 0.01714, -0.044269, -0.078134, 0.115896, -0.01184, 0.093661, -0.018205, 0.047479, -0.046138, 0.120684, 0.022739, 0.056157, -0.026476, 0.047042, 0.02004, -0.122297, -0.012022, -0.050449, 0.074122, 0.06234, 0.064978, 0.0616, 0.002451, 0.021493, -0.029126, 0.00192, 0.074912, 0.056851, 0.016726, -0.006459, 0.009298, 0.076476, 0.090604, -0.103412, -0.006616, -0.103327, -0.016875, -0.005834, 0.058765, 0.023337, -0.088037, -0.005402, 0.003327, -0.106071, -0.110076, -0.043538, 0.008665, -0.024934, -0.021982, 0.038563, 0.052394, 0.032614, 0.000537, 0.04166, 0.002993, 0.072903, -0.06283, 0.069872, 0.099796, -0.104092, 0.034419, 0.131407, 0.020647, -0.144605, -0.045572, 0.054353, -0.085828, 0.109472, 0.06123, 0.00547, 0.087684, 0.023118, 0.024177, -0.017887, 0.037621, -0.030051, -0.033188, -8.4e-05, -0.115786, -0.049254, 0.086998, -0.037057, -0.004238, 0.068879, 0.115009, 0.054147, -0.043362, -0.125607, 0.061257, -0.000541, 0.056794, 0.030499, -0.076235, 0.036351, 0.020067, 0.063581, 0.006237, 0.053999, 0.056154, 0.032981, -0.034447, 0.063182, -0.026619, 0.072399, 0.067734, 0.053182, 0.047524, -0.050863, 0.057832, -0.011111, -0.010818, 0.059158, 0.04803, 0.008086, 0.052143, -0.012995, 0.035317, 0.063931, -0.024962, -0.017643, 0.09558, -0.02737, 0.020229, 0.029992, -0.039606, 0.032767, -0.107858, -0.027555, 0.092062, -0.000636, -0.027711, -0.060232, -0.019406, 0.057477, -0.035792, 0.048827, -0.036277, 0.088372, 0.00973, 0.009332, -0.008722, 0.012444, 0.020548, 0.053392, 0.055751, 0.01716, 0.030371, 0.046532, -0.009644, 0.041966, 0.012164, 0.003634, 0.074233, 0.024137, 0.010158, 0.107064, -0.044562, -0.05207, 0.012377, 0.053197, 0.008293, 0.044703, 0.066968, 0.000105, -0.131775, 0.007305, -0.120329, 0.066077, 0.026839, 0.044507, 0.070331, -0.111474, 0.055381, 0.01621, -0.038327, 0.024156, 0.061015, 0.045984, 0.050994, 0.008129, -0.102219, -0.099287, 0.126543, 0.047851, 0.075923, 0.09682, 0.129197, -0.071644, -0.040058, 0.113432, 0.075736, -0.00373, 0.016866, 0.025894, 0.072194, -0.01181, 0.065659, 0.013738, 0.05709, -0.055197, 0.076612, 0.002187, 0.038246, -0.103679, -0.0548, 0.034992, -0.14882, -0.007833, -0.078598, 0.082202, -0.029054, -0.086637, 0.03595, 0.047931, -0.065762, 0.059895, -0.017856, 0.056958, 0.006109, 0.085667, 0.090336, 0.039996, -0.037271, -0.068757, -0.041991, 0.097279, 0.067006, 0.031805, 0.086978, 0.038093, -0.060653, 0.070723, 0.092893, -0.018852, 0.011304, 0.020899, -0.00965, 0.048605, 0.004032, 0.026292, -0.049632, -0.102985, 0.005965, 0.073144, 0.088474, 0.03463, 0.022757, 0.079624, 0.10996, -0.026877, -0.000103, 0.041798, 0.018119, -0.116444, 0.250547, 0.152762, 0.00984, -0.086416];
const DEFAULT_INST=[
 {id:"00670L",name:"富邦NASDAQ正2",tgt:0.30,src:"tw",pocket:"core"},
 {id:"00647L",name:"元大S&P500正2",tgt:0.15,src:"tw",pocket:"core"},
 {id:"00631L",name:"元大台灣50正2",tgt:0.10,src:"tw",pocket:"core"},
 {id:"00640L",name:"富邦日本正2",tgt:0.10,src:"tw",pocket:"sat"},
 {id:"00988A",name:"統一全球創新主動式",tgt:0.10,src:"tw",pocket:"sat"},
 {id:"00653L",name:"富邦印度正2",tgt:0.05,src:"tw",pocket:"sat"}];
const P={BASE:.20,DEF:.50,CAP:.50,T30:-.30,DRIFT:.25,PREM:1.0,STALE:4,
 LADDER:[[-.50,.05],[-.40,.10]],REARM:.05};
let S;
try{S=JSON.parse(localStorage.getItem("etf2x")||"{}")}catch(e){
  try{localStorage.setItem("etf2x.corrupt."+Date.now(),localStorage.getItem("etf2x"))}catch(_){ }
  S={};setTimeout(function(){toast("儲存資料毀損,已隔離備份並以預設值啟動")},0);
}
if(!S||typeof S!=="object"||Array.isArray(S))S={};
S.units=S.units||{};S.prem=S.prem||{};S.log=S.log||[];S.peak=Number.isFinite(S.peak)?S.peak:0;
S.tierTc=Number.isFinite(S.tierTc)?S.tierTc:P.BASE;
S.worker=S.worker||"https://green-term-c0ddetf2x-worker.marschannewtag.workers.dev";
/* 只有填了代碼的標的才算數:空白列不抓價、不佔權重、不擋月檢 */
const hasId=function(x){return !!(x&&x.id&&String(x.id).trim())};
/* 只有「一檔有效標的都沒有」才回退預設值——清空第一列不該把整份清單洗掉 */
if(!Array.isArray(S.inst)||!S.inst.some(hasId))S.inst=DEFAULT_INST.map(function(x){return Object.assign({},x)});
const INST=S.inst;
const LIVE=function(){return INST.filter(hasId)};
const INV=function(){var t=0;LIVE().forEach(function(i){t+=(+i.tgt||0)});return t||0.8};
const $=function(id){return document.getElementById(id)};
const fin=function(x){return Number.isFinite(x)&&x>0};
const fmt=function(n,d){d=d||0;return Number.isFinite(n)?n.toLocaleString("zh-TW",{maximumFractionDigits:d,minimumFractionDigits:d}):"—"};
/* 凡是標的名稱/代碼、changelog、Worker 回傳值進 innerHTML 都要過這一關:
   未跳脫時名稱含 " 會截斷輸入框並在下次存檔寫回損毀值,匯入他人 JSON 更等於執行任意 HTML */
const ESC_MAP={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return ESC_MAP[c]})};
function toast(m){const t=$("toast");t.textContent=m;t.style.display="block";setTimeout(function(){t.style.display="none"},2800)}
const save=function(){localStorage.setItem("etf2x",JSON.stringify(S))};
const log=function(m){S.log.unshift(new Date().toISOString().slice(0,16).replace("T"," ")+" · "+m);S.log=S.log.slice(0,500);save();renderLog()};
let Q={px:{},fx:null,sig:null};
/* tabs */
document.querySelectorAll("nav a").forEach(function(a){
  a.onclick=function(e){e.preventDefault();
    document.querySelectorAll("nav a").forEach(function(x){x.classList.remove("on")});
    a.classList.add("on");
    document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});
    $("view-"+a.dataset.v).classList.add("active");
    window.scrollTo(0,0);
  };
});
/* 「手動校正持有數」的欄位以標的代碼為 key,只有代碼變動時才需要重建 */
function renderUnits(){
  $("unitBox").innerHTML=LIVE().map(function(i){return '<div><label>'+esc(i.id)+'</label><input data-u="'+esc(i.id)+'" type="number" value="'+(S.units[i.id]||0)+'"></div>'}).join("");
}
function initUI(){
  $("cfgW").value=S.worker; $("cfgCap").value=S.cap?S.cap/10000:""; $("cfgCcy").value=S.ccy||"TWD";
  $("cashTWD").value=((S.cashTWD||0)/10000).toFixed(1); $("cashUSD").value=S.cashUSD||0;
  renderUnits();
  var ib="";
  INST.forEach(function(i,ix){
    ib+='<div style="display:grid;grid-template-columns:92px 1fr 62px 76px 36px;gap:6px;margin-bottom:6px">'
      +'<input data-if="id" data-ix="'+ix+'" value="'+esc(i.id)+'" placeholder="代碼">'
      +'<input data-if="name" data-ix="'+ix+'" value="'+esc(i.name)+'" placeholder="名稱">'
      +'<input data-if="tgt" data-ix="'+ix+'" type="number" value="'+Math.round((i.tgt||0)*100)+'" placeholder="%">'
      +'<select data-if="pocket" data-ix="'+ix+'"><option value="core"'+(i.pocket==="core"?" selected":"")+'>核心</option><option value="sat"'+(i.pocket!=="core"?" selected":"")+'>衛星</option></select>'
      +'<button class="sec" data-del="'+ix+'" style="padding:6px 4px">✕</button></div>';
  });
  $("instBox").innerHTML=ib;
  $("instBox").querySelectorAll("[data-if]").forEach(function(e){e.addEventListener("change",function(ev){
    ev.stopPropagation();
    var i=INST[+e.dataset.ix];if(!i)return;
    if(e.dataset.if==="tgt")i.tgt=Math.max(0,(+e.value||0)/100);
    else i[e.dataset.if]=e.value.trim();
    /* 只在未設定時補預設值。原本無條件寫 "tw",會把匯入的美股標的
       在使用者編輯任一欄位時改成台股來源,報價從此抓不到 */
    i.src=i.src||"tw";save();
    /* 不可在此重繪 instBox:change 是失焦時才觸發,整區重建會把使用者
       剛 tab 進去的下一個欄位一起摧毀,導致無法用鍵盤走完一列 */
    if(e.dataset.if==="id"){e.value=i.id;renderUnits()}
  })});
  $("instBox").querySelectorAll("[data-del]").forEach(function(e){e.onclick=function(){
    if(!confirm("刪除標的 "+(INST[+e.dataset.del].id||"(空白)")+"?"))return;
    INST.splice(+e.dataset.del,1);save();initUI();
  }});
  renderLog();
}
function readUI(){
  S.worker=$("cfgW").value.trim().replace(/\/+$/,"");S.cap=(+$("cfgCap").value||0)*10000;S.ccy=$("cfgCcy").value;
  S.cashTWD=Math.round((+$("cashTWD").value||0)*10)*1000;S.cashUSD=+$("cashUSD").value||0;
  document.querySelectorAll("[data-u]").forEach(function(e){S.units[e.dataset.u]=Math.max(0,Math.floor(+e.value||0))});save();
}
async function j(p){const r=await fetch(S.worker+p,{signal:AbortSignal.timeout(15000),cache:"no-store"});if(!r.ok)throw p+" "+r.status;return r.json()}
function sanad(x){return fin(x)?x:null}
/* 單一標的取價:realtime → month_daily 末筆 → /quotes 三段 fallback */
async function fetchPx(i){
  const id=encodeURIComponent(i.id);
  if(i.src==="tw"){
    const d=await j("/tw?no="+id);
    let p=(d&&d.realtime&&d.realtime.price!=null)?+d.realtime.price:NaN;
    if(!fin(p)&&d&&d.month_daily&&d.month_daily.length)p=+d.month_daily[d.month_daily.length-1][1];
    if(!fin(p)){const y=await j("/quotes?symbols="+id+".TW");p=+y[i.id+".TW"].last[1]}
    return sanad(p);
  }
  const y=await j("/quotes?symbols="+id);
  return sanad(+y[i.id].last[1]);
}
async function fetchAll(){
  /* 全部並行:序列版 8 個請求約 825ms,並行約 110ms(實測 Worker 無限流)。
     只有 /signal 保留 reject 讓上層顯示原始 HTTP 錯誤;
     匯率與個股失敗一律降為 null,交給 runCheck 的 blockers 統一處理。 */
  const list=LIVE();
  const res=await Promise.all([
    j("/signal"),
    j("/fx").then(function(d){return sanad(d&&d.last&&d.last[1])},function(){return null}),
  ].concat(list.map(function(i){return fetchPx(i).then(null,function(){return null})})));
  Q.sig=res[0];
  Q.fx=res[1];
  /* 重建整份報價表,避免已刪除標的的舊價殘留 */
  const px={};list.forEach(function(i,ix){px[i.id]=res[ix+2]});
  Q.px=px;
}
function pxTWD(i){const p=Q.px[i.id];if(!fin(p))return null;return i.src==="us"?(fin(Q.fx)?p*Q.fx:null):p}
function valTWD(i){const pt=pxTWD(i);if(pt==null)return null;const r=(S.units[i.id]||0)*pt;return Number.isFinite(r)?r:null}
function totals(){
  let inv=0,miss=false;
  for(const i of LIVE()){const v=valTWD(i);if(v==null){if((S.units[i.id]||0)>0)miss=true;continue}inv+=v}
  const cash=(S.cashTWD||0)+((S.cashUSD||0)*(fin(Q.fx)?Q.fx:0)), V=inv+cash;
  return{inv:inv,cash:cash,V:V,miss:miss};
}
function tierTarget(dd,prev){
  let want=P.BASE;
  for(const a of P.LADDER){if(dd<=a[0]){want=a[1];break}}
  if(want>prev){
    const cur=P.LADDER.find(function(a){return a[1]===prev});
    if(cur&&dd<=cur[0]+P.REARM)return prev;
  }
  return want;
}
/* Worker 回應驗證。整套策略的安全性都掛在 risk_flag 上,欄位缺漏時
   絕不可讓畫面靜默顯示「正常期」——實測 risk_flag 缺失的畸形回應
   會讓 SPX 破線 + VIX 45 的盤面顯示成正常期並建議加碼。一律 fail closed。*/
/* null 與 "" 用 + 轉型都會變成 0 並通過 Number.isFinite,必須先擋掉 */
const numOk=function(x){return x!=null&&x!==""&&Number.isFinite(+x)};
function sigBad(s){
  if(!s||typeof s!=="object"||Array.isArray(s))return "Worker /signal 回應格式錯誤";
  if(s.risk_flag==null)return "回應缺少風險旗標 risk_flag";
  if(!s.spx||!numOk(s.spx.last)||!numOk(s.spx.sma12m)||+s.spx.sma12m<=0)return "SPX 資料缺漏或無效";
  if(!s.vix||!numOk(s.vix.last))return "VIX 資料缺漏或無效";
  if(!s.asof||!s.asof.spx)return "回應缺少資料日期 asof.spx";
  return null;
}
function render(mutate){
  const s=Q.sig||{},t=totals(),V=t.V,cash=t.cash;
  const spx=s.spx||{},vix=s.vix||{};
  const spxL=+spx.last,spxM=+spx.sma12m,vixL=+vix.last;
  /* 燈號一律 fail closed:訊號有任何問題都不可顯示成正常期 */
  const risk=s.risk_flag,sigErr=sigBad(s);
  const pill=$("lampPill");
  pill.className="pill "+((risk||sigErr)?"risk":"ok");
  pill.textContent=sigErr?"⛔ 市場訊號無效 · 不可依此操作"
    :(risk?"⛔ 風險期 · 凍結投入,僅允許減碼":"✓ 正常期 · 依三層引擎執行");
  $("lampSub").textContent="SPX "+fmt(spxL)+(spx.below?" 破":" > ")+"SMA "+fmt(spxM)+" · VIX "+(Number.isFinite(vixL)?vixL.toFixed(1):"—")+(vix.above?" >32":" <32");
  $("heroAsof").textContent="資料日期 "+((s.asof&&s.asof.spx)||"—")+"(過期>4天中止)";
  if(mutate&&!t.miss&&fin(V)&&fin(Q.fx)){
    if(V>=S.peak){S.peak=V;S.tierTc=P.BASE}
    const d0=S.peak?V/S.peak-1:0;
    S.tierTc=tierTarget(d0,S.tierTc);
    save();
  }
  const dd=(S.peak&&fin(V))?V/S.peak-1:0;
  const cf=V?cash/V:0, tc=S.tierTc;
  $("heroCash").innerHTML=(cf*100).toFixed(1)+"<small>%</small>";
  $("heroTc").textContent=(tc*100);
  $("heroV").textContent="組合總值 "+fmt(V)+" TWD · 距峰值 "+(dd*100).toFixed(1)+"%"+(t.miss?" ⚠報價缺":"");
  $("tmark").style.left=Math.min(Math.abs(Math.min(dd,0))/0.60*100,100)+"%";
  $("vSMA").textContent=fmt(spxL)+" / "+fmt(spxM);
  $("vSMAsub").textContent=spx.below?"跌破均線"
    :((Number.isFinite(spxL)&&fin(spxM))?"站上均線 +"+((spxL/spxM-1)*100).toFixed(1)+"%":"—");
  $("vVIX").textContent=Number.isFinite(vixL)?vixL.toFixed(2):"—";
  $("vVIXsub").textContent=vix.above?"超過門檻":"低於門檻";
  $("vFX").textContent=fin(Q.fx)?Q.fx.toFixed(3):"—";
  if(s.tripwire&&s.tripwire.brent!=null){
    const tp=s.tripwire;
    $("vTrip").innerHTML="B "+esc(tp.brent)+" · INR "+esc(tp.usdinr)+(tp.armed?' <span class="neg">●</span>':' <span class="pos">○</span>');
    $("vTripSub").textContent=tp.armed?"觸發!下次月檢裁決出場":"Brent>90 且 INR>96";
  }else{$("vTrip").textContent="資料暫缺";}
  /* 持倉頁 */
  let coreV=0,satV=0;
  let cards="";
  for(const i of LIVE()){
    const p=Q.px[i.id],v=valTWD(i),w=(fin(V)&&v!=null)?v/V:null;
    if(v!=null){if(i.pocket==="core")coreV+=v;else satV+=v}
    const tg=(1-tc)*i.tgt/INV();
    const off=(w!=null)&&Math.abs(w-tg)>P.DRIFT*tg;
    const prem=S.prem[i.id];
    const scale=0.40;
    cards+='<div class="hcard"><div class="hrow"><div class="hname">'+esc(i.id)+'<span class="nm">'+esc(i.name)+'</span><span class="chip'+(i.pocket==="sat"?" sat":"")+'">'+(i.pocket==="sat"?"衛星":"核心")+'</span></div><div class="hval">'+(v==null?"—":fmt(v))+'</div></div>'
      +'<div class="hsub"><span>'+fmt(S.units[i.id]||0)+' 股 @ '+(fin(p)?fmt(p,2):"—")+'</span><span class="'+(off?"wn":"")+'">'+(w==null?"—":(w*100).toFixed(1))+'% / '+(tg*100).toFixed(1)+'%</span></div>'
      +'<div class="wtrack"><div class="wfill'+(off?" off":"")+'" style="width:'+(w==null?0:Math.min(w/scale*100,100))+'%"></div><div class="wtick" style="left:'+Math.min(tg/scale*100,100)+'%"></div></div>'
      +'<div class="hfoot"><span>溢價% <input data-p="'+esc(i.id)+'" value="'+esc(prem==null?"":prem)+'" placeholder="—"></span><span>'+(off?"⚠ 超出容忍帶":"容忍帶內")+'</span></div></div>';
  }
  $("holdCards").innerHTML=cards;
  document.querySelectorAll("[data-p]").forEach(function(e){e.onchange=function(){S.prem[e.dataset.p]=+e.value;save()}});
  const cV=fin(V)?V:1;
  $("aCore").style.width=(coreV/cV*100)+"%";$("aSat").style.width=(satV/cV*100)+"%";$("aCash").style.width=(cash/cV*100)+"%";
  $("lgCore").textContent=(coreV/cV*100).toFixed(1)+"%";$("lgSat").textContent=(satV/cV*100).toFixed(1)+"%";$("lgCash").textContent=(cash/cV*100).toFixed(1)+"%";
  $("cashVal").textContent=fmt(cash)+" TWD";
  $("cashPct").textContent=(cf*100).toFixed(1)+"% / "+(tc*100)+"%";
  $("cashFill").style.width=Math.min(cf/0.6*100,100)+"%";
  $("cashTick").style.left=Math.min(tc/0.6*100,100)+"%";
  return{V:V,cash:cash,cf:cf,tc:tc,dd:dd,risk:risk,miss:t.miss};
}
function makePlan(st){
  const V=st.V,cash=st.cash,cf=st.cf,tc=st.tc,dd=st.dd;
  if(st.risk){
    if(cf<P.DEF-0.001){
      const hold=V-cash;
      /* 空手時 hold 為 0,sell/hold 會產生 NaN 並一路寫進持股與現金
         (JSON 序列化後變成 null)。沒有持股就沒有減碼的餘地,直接返回。 */
      if(!(hold>0))return{hold:"風險期且目前無持股可減——維持空手等待旗標熄滅"};
      const sell=Math.min(P.DEF*V-cash,P.CAP*hold);
      const units={},orders=[];let after=0;
      for(const i of LIVE()){
        const pt=pxTWD(i),cur=S.units[i.id]||0;
        if(pt==null){units[i.id]=cur;continue}
        const nu=Math.floor(cur*(1-sell/hold));
        units[i.id]=nu;after+=nu*pt;
        if(cur-nu>0)orders.push({m:esc(i.id)+" 賣出 "+fmt(cur-nu)+" 股(約 "+fmt((cur-nu)*pt)+" TWD)",side:"sell"});
      }
      return{orders:orders,units:units,cash:V-after,head:"第三層減碼:拉現金向 50%(單次上限=持股 50%)",headSide:"sell"};
    }
    return{hold:"風險期且現金已達防禦水位——空手等待旗標熄滅,不投入、不再平衡"};
  }
  let act=(dd<=P.T30&&cf>tc*1.05)||Math.abs(cf-tc)>P.DRIFT*tc;
  for(const i of LIVE()){const v=valTWD(i);if(v==null)continue;const w=v/V,tg=(1-tc)*i.tgt/INV();if(Math.abs(w-tg)>P.DRIFT*tg)act=true;}
  if(!act)return{hold:"全部在容忍帶內——本月無動作。論點檢核:逐檔確認否證條件未觸發即續抱"};
  const units={},orders=[];let after=0;
  for(const i of LIVE()){
    const pt=pxTWD(i),cur=S.units[i.id]||0;
    if(pt==null){units[i.id]=cur;continue}
    let nu=Math.floor((1-tc)*i.tgt/INV()*V/pt);
    if(Math.abs(nu-cur)*pt<V*0.005)nu=cur;
    units[i.id]=nu;after+=nu*pt;
    if(nu!==cur){
      const du=nu-cur;
      const warn=((S.prem[i.id]||0)>P.PREM&&du>0)?" ⚠溢價超標,考慮緩買":"";
      orders.push({m:esc(i.id)+(du>0?" 買入 ":" 賣出 ")+fmt(Math.abs(du))+" 股(約 "+fmt(Math.abs(du)*pt)+" TWD)"+warn,side:du>0?"buy":"sell"});
    }
  }
  if(!orders.length)return{hold:"整數化後無需交易——本月無動作"};
  return{orders:orders,units:units,cash:V-after,head:"再平衡至目標(現金 "+(tc*100)+"%"+(dd<=P.T30?",分層抄底作用中 dd "+(dd*100).toFixed(0)+"%":"")+")",headSide:"buy"};
}
async function applyPlan(plan,tag,keepHtml){
  for(const k in plan.units)S.units[k]=plan.units[k];
  S.cashTWD=Math.max(0,Math.round((plan.cash-(S.cashUSD||0)*(fin(Q.fx)?Q.fx:0))/1000)*1000);
  save();initUI();toast("持倉已自動套用");log("一鍵套用:"+tag);
  await runCheck();
  if(keepHtml)$("sugBox").innerHTML=keepHtml+$("sugBox").innerHTML;
}
async function runCheck(){
  readUI();
  ["btnCheck","btnRefresh"].forEach(function(b){$(b).disabled=true});
  $("btnCheck").textContent="抓價中…";
  try{
    await fetchAll();
    const bad=LIVE().filter(function(i){return !fin(Q.px[i.id])});
    const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
    const sig=Q.sig||{};
    const stale=(sig.asof&&sig.asof.spx)?Math.floor((Date.parse(today)-Date.parse(sig.asof.spx))/864e5):99;
    const blockers=[];
    const sigErr=sigBad(Q.sig);
    if(sigErr)blockers.push("市場訊號無效:"+esc(sigErr));
    if(!LIVE().length)blockers.push("尚未設定任何標的(請至設定頁填入代碼)");
    if(bad.length)blockers.push("報價缺失:"+bad.map(function(i){return esc(i.id)}).join("、"));
    if(stale>P.STALE)blockers.push("市場資料過期 "+stale+" 天(asof "+esc(sig.asof?sig.asof.spx:"?")+")");
    if(!fin(Q.fx))blockers.push("匯率無效");
    if(blockers.length){
      render(false);
      $("sugBox").innerHTML=blockers.map(function(b){return "<div class='sug block'>⛔ "+b+"</div>"}).join("")
        +"<div class='sug hold'>本次不產生任何下單建議,亦不更新峰值與分層狀態。稍後重試。</div>";
      log("月檢中止:"+blockers.join(" / "));return;
    }
    const st=render(true);
    const plan=makePlan(st);
    let html="";
    if(plan.hold)html="<div class='sug hold'>"+plan.hold+"</div>";
    else{
      html="<div class='sug "+(plan.headSide==="sell"?"sell":"")+"'>"+plan.head+"</div>"
        +plan.orders.map(function(o){return "<div class='sug "+(o.side==="sell"?"sell":"")+"'>"+o.m+"</div>"}).join("")
        +"<div style='margin-top:10px'><button class='sec' id='btnApply'>已照單下單 → 一鍵套用持倉</button></div>";
    }
    $("sugBox").innerHTML=html;
    if(!plan.hold)$("btnApply").onclick=function(){applyPlan(plan,"月檢建議")};
    log("月檢:V="+fmt(st.V)+" 現金 "+(st.cf*100).toFixed(1)+"%/"+(st.tc*100)+"% dd "+(st.dd*100).toFixed(1)+"%"+(st.risk?" [風險期]":""));
  }catch(e){toast("失敗:"+e)}
  finally{["btnCheck","btnRefresh"].forEach(function(b){$(b).disabled=false});$("btnCheck").textContent="執行月度檢查"}
}
$("btnCheck").onclick=runCheck;
$("btnRefresh").onclick=runCheck;
$("btnAddInst").onclick=function(){INST.push({id:"",name:"",tgt:0.05,src:"tw",pocket:"sat"});save();initUI()};
$("btnAuto").onclick=async function(){
  readUI();if(!S.cap){toast("先填投入金額");return}
  $("btnAuto").disabled=true;
  try{
    await fetchAll();
    /* 訊號無效時不可當成「沒有風險」放行——那會在崩盤裡一次投入 80% */
    const sigErr=sigBad(Q.sig);
    if(sigErr||Q.sig.risk_flag){
      $("sugBox").innerHTML="<div class='sug block'>⛔ "+(sigErr
        ?"市場訊號無效:"+esc(sigErr)+"——無法確認風險狀態,自動分配中止。"
        :"風險旗標亮著。規格:風險期凍結投入——自動分配暫停,等旗標熄滅再來。")+"</div>";
      document.querySelector('[data-v="today"]').click();
      log(sigErr?("自動分配中止:"+sigErr):"自動分配被風險閘門擋下");
      $("btnAuto").disabled=false;return;
    }
    const bad=LIVE().filter(function(i){return !fin(Q.px[i.id])});
    if(bad.length||!fin(Q.fx)){toast("報價不完整("+bad.map(function(i){return i.id}).join(",")+"),中止");$("btnAuto").disabled=false;return}
    const capTWD=S.ccy==="USD"?S.cap*Q.fx:S.cap;
    const plan0={units:{},cash:0};let spend=0;
    let orders="",same=true;
    for(const i of LIVE()){const pt=pxTWD(i);
      const sh=Math.floor(capTWD*(1-P.BASE)*i.tgt/INV()/pt);
      const cur=S.units[i.id]||0, du=sh-cur;
      plan0.units[i.id]=sh;spend+=sh*pt;
      if(Math.abs(du)*pt>=capTWD*0.002){same=false;
        orders+="<div class='sug"+(du<0?" sell":"")+"'>"+esc(i.id)+(du>0?" 買入 ":" 賣出 ")+fmt(Math.abs(du))
          +" 股(約 "+fmt(Math.abs(du)*pt)+" TWD @ "+fmt(Q.px[i.id],2)+")<br><span style='color:var(--mut);font-size:12px'>目前 "+fmt(cur)+" → 目標 "+fmt(sh)+" 股</span></div>";}
    }
    let html="<div class='sug hold'>✔ 目標配置已套用(總資產 "+fmt(capTWD)+" TWD)。以下是<b>與目前持倉的差額</b>,請至券商執行;實際成交不同時至設定頁校正:</div>"
      +(same?"<div class='sug hold'>目前持倉已符合目標,無需交易。</div>":orders);
    plan0.cash=capTWD-spend;
    html+="<div class='sug hold'>目標現金 "+fmt(plan0.cash)+" TWD(約 "+(plan0.cash/capTWD*100).toFixed(1)+"%,定存/貨幣基金)。交易完成後帳戶現金應接近此數;若你尚未實際入金,請先確認總資產確實為 "+fmt(capTWD)+" TWD。</div>";
    document.querySelector('[data-v="today"]').click();
    await applyPlan(plan0,"自動分配",html);
  }catch(e){toast("失敗:"+e)}
  $("btnAuto").disabled=false;
};
$("btnMC").onclick=function(){
  /* 兩種前置條件分開判斷:沒填投入金額不該回報成匯率問題 */
  if(!fin(S.cap)){toast("請先至設定頁填入投入金額");return}
  if(S.ccy==="USD"&&!fin(Q.fx)){toast("USD 投入需先取得匯率(執行一次月檢)");return}
  const capTWD=S.ccy==="USD"?S.cap*Q.fx:S.cap;
  const paths=5000,H=48,B=12,res=[];
  for(let p=0;p<paths;p++){let v=1,n=0;
    /* 起點上限須為 length-B(含),否則最後 B-1 筆永遠取樣不到 */
    while(n<H){const st=Math.floor(Math.random()*(D_RETS.length-B+1));
      for(let k=0;k<B&&n<H;k++,n++)v*=1+D_RETS[st+k];}
    res.push(v);}
  res.sort(function(a,b){return a-b});
  const q=function(x){return res[Math.min(Math.floor(paths*x),paths-1)]};
  $("mcOut").innerHTML="4 年後("+fmt(paths)+" 路徑,取樣 1990–2026 定案引擎):<br>P5 "+fmt(capTWD*q(.05))+" · 中位 "+fmt(capTWD*q(.5))+" · P95 "+fmt(capTWD*q(.95))+" TWD<br>虧損機率 "+(res.filter(function(x){return x<1}).length/paths*100).toFixed(1)+"%";
  log("MC:capTWD="+fmt(capTWD));
};
$("btnExport").onclick=function(){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,1)],{type:"application/json"}));
  a.download="etf2x-changelog.json";a.click();
};
$("btnImport").onclick=function(){$("impFile").click()};
$("impFile").onchange=function(){
  const f=this.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=function(){
    try{const o=JSON.parse(r.result);
      if(!o||typeof o!=="object"||Array.isArray(o))throw "格式錯誤";
      localStorage.setItem("etf2x",JSON.stringify(o));location.reload();
    }catch(e){toast("匯入失敗:"+e)}
  };r.readAsText(f);
};
$("btnResetPeak").onclick=function(){
  if(!confirm("重設組合峰值與分層狀態?(大額入金、ETF 分割/反分割後使用)"))return;
  S.peak=0;S.tierTc=P.BASE;save();toast("已重設,下次月檢重建峰值");log("維護:重設峰值與分層");
};
function renderLog(){$("logBox").innerHTML=S.log.slice(0,40).map(function(l){return "<div class='log'>"+esc(l)+"</div>"}).join("")||"<div class='log'>尚無紀錄</div>"}
initUI();
document.addEventListener("change",function(e){if(e.target.matches("input,select")&&!e.target.dataset.p&&e.target.id!=="impFile")readUI()});
(async function(){
  try{
    /* 與 fetchAll 一致:/fx 回應缺 last 欄位時降為 null,不要整段開機失敗 */
    Q.sig=await j("/signal");
    Q.fx=await j("/fx").then(function(d){return sanad(d&&d.last&&d.last[1])},function(){return null});
    const sigErr=sigBad(Q.sig);
    /* 燈號由 render 依 sigBad 自行 fail closed,這裡只補上具體原因 */
    if(sigErr){render(false);$("lampSub").textContent=sigErr;return}
    if(LIVE().some(function(i){return (S.units[i.id]||0)>0}))await runCheck();
    else render(false);
  }catch(e){const p=$("lampPill");p.className="pill risk";p.textContent="⛔ 無法連線 Worker";$("lampSub").textContent=String(e)}
})();
