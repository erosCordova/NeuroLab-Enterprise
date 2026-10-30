import test from "node:test";
import assert from "node:assert/strict";
import {verifySmokeTarget,runReleaseSmoke} from "../release-smoke.mjs";

const production="https://neurolab-enterprise-xi.vercel.app";
const ci="http://127.0.0.1:4189";
const env={GITHUB_ACTIONS:"true",NEUROLAB_CI_SMOKE:"1"};
const sha="a".repeat(40);

function goodFetch(override={}){
  const calls=[];
  const responses={
    "/":{status:200,body:'<html><title>NeuroLab Enterprise</title><meta name="neurolab-release" content="'+sha+'"><script type="module" src="/assets/index-real.js"></script></html>',
         headers:{"content-type":"text/html","content-security-policy-report-only":"default-src 'self'; script-src 'self'; frame-ancestors 'none'"}},
    "/api/v1/ready":{status:200,body:{status:"ready"},headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}},
    "/api/v1/health":{status:200,body:{status:"ok",database:"postgresql",training:"browser-tensorflowjs (not server)"},headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}},
    "/api/v1/release":{status:200,body:{commit:sha,protocol:"neurolab-cnn-real-1"},headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}},
    "/api/v1/auth/me":{status:401,body:{detail:"Inicia sesión para continuar."},headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}},
    "/api/v1/projects":{status:401,body:{detail:"Inicia sesión para continuar."},headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}},
    "/.env":{status:404,body:"",headers:{"content-type":"text/html"}},
  };
  const fixture=Object.assign({},responses,override);
  return {
    calls,
    fetcher: async(url,options)=>{
      const route=new URL(url).pathname;
      calls.push({path:route,method:options.method,redirect:options.redirect});
      const entry=fixture[route];
      if(!entry)throw Error("Ruta no esperada: "+route);
      return new Response(typeof entry.body==="string"?entry.body:JSON.stringify(entry.body),
        {status:entry.status,headers:entry.headers});
    }
  };
}

test("solo permite producción exacta o CI local con dos barreras",()=>{
  assert.equal(verifySmokeTarget(production),production);
  assert.equal(verifySmokeTarget(ci,env),ci);
  for (const value of [
    "https://evil.example", "https://neurolab-enterprise-xi.vercel.app.evil.example",
    "http://neurolab-enterprise-xi.vercel.app", "https://foo@neurolab-enterprise-xi.vercel.app",
    "https://neurolab-enterprise-xi.vercel.app/api", "https://neurolab-enterprise-xi.vercel.app?q=1",
    "http://127.0.0.1:4190","http://127.0.0.1:4189"
  ])assert.throws(()=>verifySmokeTarget(value),/Solo se permite|únicamente|inválido|exacto/);
  assert.throws(()=>verifySmokeTarget(ci,{GITHUB_ACTIONS:"true"}),/Solo se permite/);
});
test("diagnóstico completo es exclusivamente GET y no incluye sesiones ni secretos",async()=>{
  const mock=goodFetch();
  const result=await runReleaseSmoke(ci,{env,fetcher:mock.fetcher});
  assert.equal(result.ready,true);
  assert.equal(result.read_only,true);
  assert.equal(result.authenticated,false);
  assert.equal(result.checks,7);
  assert.equal(mock.calls.length,7);
  assert.ok(mock.calls.every(call=>call.method==="GET"&&call.redirect==="manual"));
});
test("bloquea esquema incompleto, cache privado y CSP ausente",async()=>{
  for(const patch of [
    {"/api/v1/ready":{status:503,body:{detail:"No preparada."},headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}}},
    {"/api/v1/auth/me":{status:401,body:{detail:"Necesita sesión"},headers:{"cache-control":"public","x-content-type-options":"nosniff"}}},
    {"/":{status:200,body:'<html><title>NeuroLab Enterprise</title><script src="/assets/index.js"></script></html>',headers:{}}},
    {"/.env":{status:200,body:"SECRET",headers:{}}},
    {"/api/v1/release":{status:200,body:{commit:"b".repeat(40),protocol:"neurolab-cnn-real-1"},headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}}},
  ]){
    const mock=goodFetch(patch);
    await assert.rejects(runReleaseSmoke(ci,{env,fetcher:mock.fetcher}),/Diagnóstico detenido|política de|protección|mismo commit/);
  }
});
