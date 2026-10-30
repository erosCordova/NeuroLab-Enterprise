/**
 * NeuroLab Enterprise: inspección de producción GET-only, sin cookies ni tokens.
 * Este diagnóstico NUNCA despliega, migra, crea cuentas ni escribe datos.
 */
const PRODUCTION_ORIGIN = "https://neurolab-enterprise-xi.vercel.app";
const CI_ORIGIN = "http://127.0.0.1:4189";

export function verifySmokeTarget(input, env = process.env) {
  if (typeof input !== "string" || input.length > 180) {
    throw new Error("Se requiere el origen exacto de NeuroLab.");
  }
  let url;
  try { url = new URL(input); } catch {
    throw new Error("Origen de diagnóstico inválido.");
  }
  if (url.href !== url.origin + "/" || url.username || url.password ||
      url.search || url.hash) {
    throw new Error("Escribe únicamente un origen, sin rutas, credenciales ni parámetros.");
  }
  const allowed = url.origin === PRODUCTION_ORIGIN ||
    (url.origin === CI_ORIGIN && env.GITHUB_ACTIONS === "true" &&
     env.NEUROLAB_CI_SMOKE === "1");
  if (!allowed) {
    throw new Error("Solo se permite el dominio de NeuroLab o el entorno local aislado de GitHub CI.");
  }
  return url.origin;
}

function requireStatus(response, expected, path) {
  if (response.status !== expected) {
    throw new Error("Diagnóstico detenido en " + path + ": HTTP " + response.status +
      ", esperado " + expected + ".");
  }
}
function requireNoStore(response, path) {
  const cache = response.headers.get("cache-control") || "";
  if (!cache.includes("no-store")) {
    throw new Error("Diagnóstico detenido en " + path + ": política de caché de datos privados incompleta.");
  }
}
async function getJson(get, origin, path, status) {
  const response = await get(origin + path, {method:"GET", redirect:"manual",
    headers:{"Accept":"application/json"}, signal:AbortSignal.timeout(15000)});
  requireStatus(response, status, path);
  requireNoStore(response, path);
  if (response.headers.get("x-content-type-options") !== "nosniff") {
    throw new Error("Falta protección nosniff en " + path + ".");
  }
  return await response.json();
}

export async function runReleaseSmoke(input, {
  env=process.env,
  fetcher=globalThis.fetch
}={}) {
  const origin=verifySmokeTarget(input,env);
  const get=(url,options)=>fetcher(url,options);
  const home=await get(origin+"/", {method:"GET",redirect:"manual",
    headers:{"Accept":"text/html"},signal:AbortSignal.timeout(15000)});
  requireStatus(home,200,"/");
  const html=await home.text();
  if (!/NeuroLab Enterprise/i.test(html) ||
      !/src=["']\/assets\/[^"']+\.js["']/i.test(html)) {
    throw new Error("La portada no contiene el bundle de producción de NeuroLab.");
  }
  const policy=home.headers.get("content-security-policy-report-only") || "";
  if (!policy.includes("script-src 'self'") ||
      !policy.includes("frame-ancestors 'none'")) {
    throw new Error("La política de seguridad en observación no está presente.");
  }
  const ready=await getJson(get,origin,"/api/v1/ready",200);
  if (ready?.status!=="ready") {
    throw new Error("La API no confirmó el esquema PostgreSQL completo.");
  }
  const health=await getJson(get,origin,"/api/v1/health",200);
  if (health?.status!=="ok" || health?.database!=="postgresql" ||
      health?.training!=="browser-tensorflowjs (not server)") {
    throw new Error("Los datos de salud de la API no corresponden al backend CNN esperado.");
  }
  for (const path of ["/api/v1/auth/me","/api/v1/projects"]) {
    const denied=await getJson(get,origin,path,401);
    if (typeof denied?.detail!=="string") {
      throw new Error("La API no respondió con una denegación válida en " + path + ".");
    }
  }
  const envFile=await get(origin+"/.env",{method:"GET",redirect:"manual",
    signal:AbortSignal.timeout(15000)});
  requireStatus(envFile,404,"/.env");
  return {
    ready:true,read_only:true,authenticated:false,checks:6,
    findings:["frontend","csp-report-only","schema","api","sesiones-sin-autenticar","archivos-protegidos"]
  };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const target=process.argv[2];
  runReleaseSmoke(target).then(result=>{
    if(!result.ready)throw new Error("La comprobación no terminó.");
    process.stdout.write("NEUROLAB_SMOKE_READ_ONLY=APROBADO\n");
    process.stdout.write("COMPROBACIONES=" + result.findings.join(",") + "\n");
  }).catch(error=>{
    // Nunca mostrar URL, contenido HTML, tokens ni respuestas del servidor.
    process.stderr.write("NEUROLAB_SMOKE_READ_ONLY=FALLO\n");
    process.stderr.write("MOTIVO=" + (error instanceof Error?error.message:"Fallo no identificado") + "\n");
    process.exitCode=1;
  });
}
