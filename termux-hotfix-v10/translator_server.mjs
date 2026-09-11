import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { env, pipeline } from "./node_modules/@huggingface/transformers/dist/transformers.web.js";

const PORT=Number(process.env.EBURON_TRANSLATOR_PORT||8851);
const MODEL=process.env.EBURON_TRANSLATOR_MODEL||"huggingworld/m2m100_418M";
const CACHE=process.env.EBURON_TRANSLATOR_CACHE||path.join(os.homedir(),".eburon-edge","models","m2m100-cache");
fs.mkdirSync(CACHE,{recursive:true});
env.cacheDir=CACHE;
env.allowLocalModels=true;
env.allowRemoteModels=process.env.EBURON_OFFLINE!=="1";

let translator=null, initPromise=null, initError=null;
async function init(){
  if(translator)return translator;
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    try{
      translator=await pipeline("translation",MODEL,{dtype:"q8",device:"wasm"});
      return translator;
    }catch(e){initError=String(e?.stack||e);throw e}
  })();
  return initPromise;
}
function json(res,status,obj){
  const b=Buffer.from(JSON.stringify(obj));
  res.writeHead(status,{"content-type":"application/json","content-length":b.length,"cache-control":"no-store"});
  res.end(b);
}
async function readJson(req){
  const chunks=[];for await(const c of req)chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==="GET"&&req.url==="/health"){
      try{await init();json(res,200,{status:"ready",engine:"m2m100",model:MODEL,mode:"translation-only",thinking:false})}
      catch(e){json(res,503,{status:"starting",engine:"m2m100",error:initError||String(e)})}
      return;
    }
    if(req.method==="POST"&&req.url==="/v1/translate"){
      const body=await readJson(req);
      const text=String(body.text||"").trim();
      const src=String(body.source_language||body.src_lang||"en").split("-")[0].toLowerCase();
      const tgt=String(body.target_language||body.tgt_lang||"nl").split("-")[0].toLowerCase();
      if(!text){json(res,400,{error:"text is required"});return}
      if(src===tgt){json(res,200,{text,source_language:src,target_language:tgt,engine:"m2m100"});return}
      const t=await init();
      const started=performance.now();
      const out=await t(text,{src_lang:src,tgt_lang:tgt,max_new_tokens:256,num_beams:1,do_sample:false});
      const translated=Array.isArray(out)?String(out[0]?.translation_text||"").trim():"";
      if(!translated){json(res,500,{error:"translation engine returned empty text"});return}
      json(res,200,{text:translated,source_language:src,target_language:tgt,engine:"m2m100",latency_ms:Math.round(performance.now()-started)});
      return;
    }
    json(res,404,{error:"not found"});
  }catch(e){json(res,500,{error:String(e?.message||e)})}
});
init().catch(()=>{});
server.listen(PORT,"127.0.0.1",()=>console.log("M2M100 translator listening on",PORT));
