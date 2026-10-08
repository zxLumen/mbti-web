import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 8787
const distDir = join(__dirname, 'dist')
app.use(express.static(distDir))

const sessions = new Map()
const stats = { start:0, answer:0, done:0, reset:0, perCode:{} }

function now() { return Date.now() }
function cleanup() {
  const ttl = 45*60*1000
  for (const [k,s] of sessions) {
    if (now()-s.lastAt > ttl) sessions.delete(k)
  }
}
setInterval(cleanup, 60*1000)

app.post('/api/mbti/start', (req,res)=>{
  const id = crypto.randomUUID()
  const s = createSession(id)
  const q = pickNext(s)
  if (!q) return res.status(500).json({error:'no_q'})
  s.usedIds.add(q.id)
  s.lastAt = now()
  sessions.set(id,s)
  stats.start++
  res.json({ sessionId:id, question:q, state:{qCount:s.qCount,minQ:s.minQ,maxQ:s.maxQ,conf:s.conf,scores:s.scores}})
})

app.post('/api/mbti/answer', async (req,res)=>{
  const {sessionId,text} = req.body||{}
  const s = sessions.get(sessionId)
  if (!s || s.done) return res.status(400).json({error:'bad'})
  s.lastAt = now()
  const lastQ = s.history.length ? findQ(s.history[s.history.length-1].qId) : null
  const bank = bankUnused(s)
  try {
    // AI call optional? we need to call; but use fetch to gateway if configured? simplified: skip AI if no key, just do naive
    const ai = await callAI({sessionId:s.id, history:s.history, qCount:s.qCount, conf:s.conf, scores:s.scores, lastQ, userText:text||'', bank, shouldClarify:shouldClarify(s), minQ:s.minQ,maxQ:s.maxQ,confT:s.confT})
    if (ai.action==='clarify' || shouldClarify(s)) {
      s.clarifying=true
      return res.json({clarify:true,text:ai.reason||'能说说更倾向 A 还是 B 吗？'})
    }
    if (ai.cls>=-2 && ai.cls<=2 && lastQ) {
      applyClassification(s,lastQ,ai.cls)
    }
    if (checkDone(s)) {
      s.done=true; s.resultCode=computeResult(s); stats.done++; stats.perCode[s.resultCode]=(stats.perCode[s.resultCode]||0)+1
      return res.json({done:true,resultCode:s.resultCode,progress:{qCount:s.qCount,minQ:s.minQ,maxQ:s.maxQ},conf:s.conf})
    }
    const qn = pickNext(s)
    if (!qn){ s.done=true; s.resultCode=computeResult(s); return res.json({done:true,resultCode:s.resultCode,progress:{qCount:s.qCount,minQ:s.minQ,maxQ:s.maxQ},conf:s.conf})}
    s.usedIds.add(qn.id); stats.answer++
    return res.json({done:false,question:qn,progress:{qCount:s.qCount,minQ:s.minQ,maxQ:s.maxQ},conf:s.conf})
  } catch(e){
    const qn = pickNext(s)
    if (!qn) return res.status(500).json({error:'fail'})
    s.usedIds.add(qn.id)
    return res.json({done:false,question:qn,progress:{qCount:s.qCount,minQ:s.minQ,maxQ:s.maxQ},conf:s.conf})
  }
})

app.post('/api/mbti/reset',(req,res)=>{
  const {sessionId}=req.body||{}
  if (sessionId&&sessions.has(sessionId)){ sessions.delete(sessionId); stats.reset++ }
  res.json({ok:true})
})
app.post('/api/mbti/stats',(req,res)=>{
  const {type,code}=req.body||{}
  if (type==='start') stats.start++
  if (type==='answer') stats.answer++
  if (type==='done'){ stats.done++; if(code) stats.perCode[code]=(stats.perCode[code]||0)+1 }
  if (type==='reset') stats.reset++
  res.json({ok:true})
})

app.get('*',(req,res)=>res.sendFile(join(distDir,'index.html')))
app.listen(PORT,()=>console.log('mbti-web',PORT))

// --- inline logic (mirror engine) ---
const AXES=['E','I','S','N','T','F','J','P']
const BANK = [
  {id:'ei-001',axis:'E',pair:'A',stem:'下班后你更倾向：',optionA:'约朋友聚会、活动',optionB:'独自回家休息',weight:1.2},
  {id:'ei-002',axis:'E',pair:'A',stem:'在社交场合，你通常：',optionA:'主动找人聊天，比较容易打开话题',optionB:'先观察一会，再决定要不要加入',weight:1.2},
  {id:'sn-001',axis:'S',pair:'A',stem:'学新东西时，你更喜欢：',optionA:'从具体例子、操作步骤入手',optionB:'先了解整体原理、框架再细看',weight:1.2},
  {id:'sn-002',axis:'N',pair:'B',stem:'你平时更常注意：',optionA:'眼前实实在在的细节',optionB:'背后的可能性、未来走向',weight:1.2},
  {id:'tf-001',axis:'T',pair:'A',stem:'做决定时，你通常先考虑：',optionA:'逻辑、事实、利弊',optionB:'人情、感受、关系和谐',weight:1.2},
  {id:'jp-001',axis:'J',pair:'A',stem:'出门前，你通常：',optionA:'会提前规划好行程、带齐东西',optionB:'到时候再说，走到哪算哪也可以',weight:1.2},
]
function createSession(id){ return {id,createdAt:now(),lastAt:now(),qCount:0,minQ:12,maxQ:30,confT:0.85,scores:{E:0,I:0,S:0,N:0,T:0,F:0,J:0,P:0},conf:{E:0,I:0,S:0,N:0,T:0,F:0,J:0,P:0},history:[],done:false,clarifying:false,usedIds:new Set()}}
function opp(a){ return ({E:'I',I:'E',S:'N',N:'S',T:'F',F:'T',J:'P',P:'J'})[a]||null}
function pickNext(s){ const c=BANK.filter(q=>!s.usedIds.has(q.id)); if(!c.length) return null; let best='E',bc=1e9; for(const ax of AXES){ if((s.conf[ax]||0)<bc-1e-9){ bc=s.conf[ax]||0; best=ax } } let list=c.filter(q=>q.axis===best); if(!list.length) list=c; list.sort((a,b)=>b.weight-a.weight); return {id:list[0].id,axis:list[0].axis,stem:list[0].stem,optionA:list[0].optionA,optionB:list[0].optionB} }
function applyClassification(s,q,cls){ const v=cls*q.weight; s.scores[q.axis]+=v; const o=opp(q.axis); if(o) s.scores[o]-=v; s.history.push({qId:q.id,axis:q.axis,cls,w:q.weight}); s.qCount=s.history.length; updateConf(s); s.clarifying=false }
function updateConf(s){ for(const ax of AXES){ const list=s.history.filter(h=>h.axis===ax); const qAx=list.length; if(!qAx){ s.conf[ax]=0; continue } let flips=0; for(let i=1;i<list.length;i++){ if(Math.sign(list[i].cls)!==Math.sign(list[i-1].cls)&&list[i].cls!==0&&list[i-1].cls!==0) flips++ } const base=Math.min(1,qAx/6); const consist=1-(flips/Math.max(1,qAx))*0.4; s.conf[ax]=Math.min(1,Math.max(0,base*(0.6+0.4*consist))) } }
function checkDone(s){ if(s.done) return true; if(s.qCount>=s.maxQ) return true; if(AXES.every(ax=>s.conf[ax]>=s.confT)&&s.qCount>=s.minQ) return true; return false }
function computeResult(s){ const p=[['E','I'],['S','N'],['T','F'],['J','P']]; let c=''; for(const [a,b] of p){ c+=s.scores[a]>=s.scores[b]?a:b } return c }
function shouldClarify(s){ if(s.clarifying) return false; const r=s.history.slice(-2); if(r.length<2) return false; return r.every(h=>h.cls===0) }
function findQ(id){ return BANK.find(x=>x.id===id)||null }
function bankUnused(s){ return BANK.filter(x=>!s.usedIds.has(x.id)).map(x=>({id:x.id,axis:x.axis,stem:x.stem,optionA:x.optionA,optionB:x.optionB,weight:x.weight})) }
async function callAI(ctx){
  const {settings,keys}=loadSettings()
  let baseURL=settings.baseURL||'', apiKey=settings.apiKey||(keys[settings.provider]||'')
  if(settings.provider==='zxGateway'){ baseURL=baseURL||process.env.ZX_GATEWAY_BASE_URL||''; apiKey=apiKey||process.env.ZX_GATEWAY_TOKEN||'' }
  if(!baseURL) return naiveAI(ctx)
  const body={model:settings.model||'gpt-4o-mini',messages:[{role:'system',content:'MBTI分类JSON'},{role:'user',content:JSON.stringify(ctx)}],temperature:0.4,max_tokens:1024,response_format:{type:'json_object'}}
  try{ const r=await fetch(baseURL.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':apiKey?'Bearer '+apiKey:''},body:JSON.stringify(body)}); if(!r.ok) return naiveAI(ctx); const d=await r.json(); return JSON.parse(d.choices?.[0]?.message?.content||'{}') }catch{return naiveAI(ctx)}
}
function naiveAI(ctx){ if(ctx.shouldClarify) return {action:'clarify',reason:'能说说更倾向 A 还是 B 吗？'}; const t=(ctx.userText||'').toLowerCase(); let cls=0; if(t.includes('a')||t.includes('更像a')||t.includes('倾向a')) cls=1; if(t.includes('b')||t.includes('更像b')||t.includes('倾向b')) cls=-1; if(t.includes('不确定')||t.includes('说不准')||t.includes('视情况')) cls=0; if(t.includes('很像a')||t.includes('强烈a')) cls=2; if(t.includes('很像b')||t.includes('强烈b')) cls=-2; const done=(ctx.qCount>=ctx.minQ&&Object.values(ctx.conf).every(v=>v>=ctx.confT))||ctx.qCount>=ctx.maxQ; if(done){ const code=computeResult({scores:ctx.scores,conf:ctx.conf,qCount:ctx.qCount,minQ:ctx.minQ,maxQ:ctx.maxQ,confT:ctx.confT,done:false,history:[],clarifying:false,usedIds:new Set(),id:'x',createdAt:now(),lastAt:now()}); return {action:'done',cls,resultCode:code} } return {action:'next',cls} }
function loadSettings(){ try{ const fs=require('fs'); const d=JSON.parse(fs.readFileSync(join(__dirname,'data','settings.json'),'utf8')); const k=JSON.parse(fs.readFileSync(join(__dirname,'data','keys.json'),'utf8')); return {settings:d,keys:k} }catch{return {settings:{provider:'zxGateway',model:'gpt-4o-mini',maxTokens:2048,temperature:0.4},keys:{}}} }
