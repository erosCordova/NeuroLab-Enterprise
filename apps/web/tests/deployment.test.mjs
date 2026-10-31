import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeploymentConfig} from '../deployment-config.mjs';

test('Despliegue: rechaza destinos incompletos y credenciales antes de publicar', () => {
  for (const value of [undefined, '', 'http://example.onrender.com', 'https://example.com',
    'https://user:secret@example.onrender.com', 'https://example.onrender.com/api',
    'https://example.onrender.com?secret=private', 'https://example.onrender.com.attacker.example']) {
    assert.throws(() => createDeploymentConfig(value));
  }
});

test('Despliegue: conserva /api, activa modo conectado y evita caché de cuentas', () => {
  const config = createDeploymentConfig('https://example.onrender.com/');
  assert.equal(config.rewrites[0].destination, 'https://example.onrender.com/api/:path*');
  assert.match(config.buildCommand, /VITE_USE_API=true/);
  assert.match(config.buildCommand, /VITE_RELEASE_SHA=\$VERCEL_GIT_COMMIT_SHA/);
  assert.equal(config.headers[0].headers[0].value, 'private, no-store');
});


test('La configuración pública impide caché de cuentas y declara cabeceras de seguridad', () => {
  const config=createDeploymentConfig('https://example.onrender.com');
  const security=config.headers.find(item=>item.source==='/(.*)');
  assert.ok(security);
  const headers=Object.fromEntries(security.headers.map(item=>[item.key,item.value]));
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  assert.equal(headers['X-Frame-Options'],'DENY');
  assert.match(headers['Permissions-Policy'],/camera=\(\)/);
  const api=config.headers.find(item=>item.source==='/api/:path*');
  assert.equal(api.headers[0].value,'private, no-store');
});


test('CSP de observación protege orígenes sin interrumpir TensorFlow.js', () => {
  const config=createDeploymentConfig('https://example.onrender.com');
  const headers=Object.fromEntries(config.headers.find(h=>h.source==='/(.*)').headers.map(h=>[h.key,h.value]));
  const policy=headers['Content-Security-Policy-Report-Only'];
  assert.match(policy,/default-src 'self'/);
  assert.match(policy,/object-src 'none'/);
  assert.match(policy,/frame-ancestors 'none'/);
  assert.match(policy,/connect-src 'self'/);
  assert.ok(!headers['Content-Security-Policy']); // Aún no bloquear inferencia CNN sin ensayo CSP completo.
});

test('MNIST: cuatro rutas fijas por mismo origen, sin proxy arbitrario', () => {
  const config=createDeploymentConfig('https://example.onrender.com');
  const expected=[
    'train-images-idx3-ubyte.gz', 'train-labels-idx1-ubyte.gz',
    't10k-images-idx3-ubyte.gz', 't10k-labels-idx1-ubyte.gz',
  ];
  assert.equal(config.rewrites.length,5);
  for(const name of expected){
    assert.deepEqual(config.rewrites.find(rule=>rule.source==='/datasets/mnist/'+name),{
      source:'/datasets/mnist/'+name,
      destination:'https://storage.googleapis.com/cvdf-datasets/mnist/'+name,
    });
  }
  assert.equal(config.rewrites.filter(rule=>rule.source.includes(':file')).length,0);
});
