import {useEffect,useState} from 'react';
import type {AnalysisInput} from './analyzer';
import type {Result} from './model';
export type EngineStatus={phase:'idle'|'downloading'|'loading'|'ready'|'error';loaded?:number;total?:number;saved?:boolean;error?:string;memoryBytes?:number};
let snapshot:EngineStatus={phase:'idle'};
const listeners=new Set<(s:EngineStatus)=>void>();
let worker:Worker | undefined,sequence=0,initialization:Promise<unknown> | undefined;
const requests=new Map<number,{resolve:(value:unknown)=>void;reject:(e:Error)=>void}>();
const update=(next:EngineStatus)=>{snapshot=next;listeners.forEach(fn=>fn(next));};
const base=new URL(import.meta.env.BASE_URL,location.href).href;
function getWorker() {
  if(!worker) {
    worker=new Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.type==='status'){update(data);return;}
      const request=requests.get(data.id);if(!request)return;requests.delete(data.id);
      if(data.error)request.reject(new Error(data.error));else request.resolve(data.result);
    };
    worker.onerror=()=>{
      const error=new Error('분석기를 실행하지 못했습니다. 메모리를 확보하거나 다른 브라우저에서 다시 시도해 주세요.');
      update({phase:'error',error:error.message});requests.forEach(r=>r.reject(error));requests.clear();worker?.terminate();worker=undefined;initialization=undefined;
    };
  }
  return worker;
}
function request(type:string,input?:AnalysisInput):Promise<unknown> {
  return new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});getWorker().postMessage({id,type,input,base});});
}
export function prepareEngine() {
  if(!initialization) {
    update({phase:'downloading',loaded:0});
    initialization=request('init').catch(e=>{initialization=undefined;throw e;});
  }
  return initialization;
}
export async function analyzeBrowser(input:AnalysisInput):Promise<Result> {await prepareEngine();return await request('analyze',input) as Result;}
export function useEngineStatus() {
  const [state,setState]=useState(snapshot);
  useEffect(()=>{listeners.add(setState);setState(snapshot);return()=>{listeners.delete(setState);};},[]);
  return state;
}
