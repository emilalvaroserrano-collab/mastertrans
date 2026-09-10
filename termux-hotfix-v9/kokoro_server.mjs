import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KokoroTTS } from "kokoro-js";

const PORT=Number(process.env.EBURON_KOKORO_PORT||8855);
const MODEL=process.env.KOKORO_MODEL||"onnx-community/Kokoro-82M-v1.0-ONNX";
let tts=null, initError=null, initPromise=null;

async function init(){
  if(tts)return tts;
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    try{
      tts=await KokoroTTS.from_pretrained(MODEL,{dtype:"q8",device:"wasm"});
      return tts;
    }catch(e){initError=String(e?.stack||e);throw e}
  })();
  return initPromise;
}

function sendJson(res,status,obj){
  const data=Buffer.from(JSON.stringify(obj));
  res.writeHead(status,{"content-type":"application/json","content-length":data.length});
  res.end(data);
}
async function body(req){
  const chunks=[];for await(const c of req)chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}
const LANGS=[{code:"en-US",name:"English (US)"},{code:"en-GB",name:"English (UK)"}];

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==="GET"&&req.url==="/v1/health"){
      try{await init();sendJson(res,200,{status:"ready",runtime:"kokoro-js",model:MODEL})}
      catch(e){sendJson(res,503,{status:"unavailable",runtime:"kokoro-js",error:initError||String(e)})}
      return;
    }
    if(req.method==="GET"&&req.url==="/v1/voices"){
      const engine=await init();
      const voices=engine.list_voices();
      const items=Object.entries(voices).map(([id,v])=>({id,name:v.name||id,language:v.language||"en-us",gender:v.gender||"",quality:v.overallGrade||v.targetQuality||""}));
      sendJson(res,200,{languages:LANGS,voices:items});return;
    }
    if(req.method==="POST"&&req.url==="/v1/tts"){
      const b=await body(req);const text=String(b.text||b.input||"").trim();const voice=String(b.voice||"af_heart");
      if(!text){sendJson(res,400,{error:"text is required"});return}
      const engine=await init();const audio=await engine.generate(text,{voice});
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),"eburon-kokoro-"));const out=path.join(dir,"out.wav");
      await audio.save(out);const wav=await fs.readFile(out);await fs.rm(dir,{recursive:true,force:true});
      res.writeHead(200,{"content-type":"audio/wav","content-length":wav.length});res.end(wav);return;
    }
    sendJson(res,404,{error:"not found"});
  }catch(e){sendJson(res,500,{error:String(e?.message||e)})}
});

init().catch(()=>{});
server.listen(PORT,"127.0.0.1",()=>console.log("Kokoro JS server listening on",PORT));
