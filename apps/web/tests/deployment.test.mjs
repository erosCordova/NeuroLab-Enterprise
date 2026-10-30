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
