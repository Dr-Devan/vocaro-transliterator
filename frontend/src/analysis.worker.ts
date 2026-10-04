import {analyzeLocal, type Engine, type AnalysisInput} from './analyzer';

let engine:Engine;
let initialization:Promise<void> | undefined;
const status=(phase:string,extra:Record<string,unknown>={})=>self.postMessage({type:'status',phase,...extra});
async function initialize(base:string) {
  if(!('DecompressionStream' in self)) throw new Error('이 브라우저는 분석 사전 압축 해제를 지원하지 않습니다. 최신 Chrome·Edge·Safari·Firefox를 사용해 주세요.');
  const manifestResponse=await fetch(`${base}dictionary/manifest.json`);
  if(!manifestResponse.ok) throw new Error('사전 정보를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.');
  const manifest=await manifestResponse.json();
  const url=`${base}dictionary/${manifest.file}`;
  let cache:Cache | undefined, response:Response | undefined;
  let saved=true;
  try {cache=await caches.open(`vocaro-dictionary-${manifest.version}`);response=await cache.match(url);} catch {saved=false;}
  status(response?'loading':'downloading',{total:manifest.bytes,loaded:0});
  let compressed:ArrayBuffer;
  if(response) compressed=await response.arrayBuffer();
  else {
    const remote=await fetch(url);if(!remote.ok || !remote.body) throw new Error('분석 사전을 다운로드하지 못했습니다. 다시 시도해 주세요.');
    const reader=remote.body.getReader(),chunks:Uint8Array[]= [];let loaded=0;
    for(;;) {const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;status('downloading',{loaded,total:manifest.bytes});}
    const bytes=new Uint8Array(loaded);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}chunks.length=0;compressed=bytes.buffer;
  }
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',compressed))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==manifest.sha256) {await cache?.delete(url);throw new Error('사전 다운로드가 손상되었습니다. 다시 다운로드해 주세요.');}
  if(!response && cache) try {await cache.put(url,new Response(compressed));}catch {saved=false;}
  status('loading',{loaded:manifest.bytes,total:manifest.bytes,saved});
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
  if(bytes.length!==manifest.rawBytes) throw new Error('사전 파일 크기가 올바르지 않습니다. 다시 시도해 주세요.');
  const moduleUrl=`${base}engine/vocaro_sudachi.js`;
  const wasm=await import(/* @vite-ignore */ moduleUrl);
  const memory=await wasm.default();
  engine=new wasm.Reader(bytes);
  status('ready',{loaded:manifest.bytes,total:manifest.bytes,saved,memoryBytes:memory.memory.buffer.byteLength});
}
self.onmessage=async ({data}:{data:{id:number;type:string;base:string;input:AnalysisInput}})=>{
  try {
    if(data.type==='init') {initialization ??= initialize(data.base);await initialization;self.postMessage({id:data.id,type:'response',result:true});}
    else {if(!initialization)throw new Error('분석 사전을 먼저 준비해 주세요.');await initialization;const result=analyzeLocal(engine,data.input);self.postMessage({id:data.id,type:'response',result});}
  } catch(e) {
    const error=e instanceof Error?e.message:String(e);
    if(data.type==='init') {status('error',{error});initialization=undefined;}
    self.postMessage({id:data.id,type:'response',error});
  }
};
