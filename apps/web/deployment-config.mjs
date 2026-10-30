export function createDeploymentConfig(value) {
  if (!value) throw new Error('Falta NEUROLAB_API_ORIGIN: usa la URL verificada del backend Render.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.onrender\.com$/.test(url.hostname)
      || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEUROLAB_API_ORIGIN debe ser un origen HTTPS de Render, sin rutas ni credenciales.');
  }
  return {
    framework: 'vite',
    buildCommand: 'VITE_USE_API=true VITE_API_BASE_URL=/api/v1 npm run build',
    outputDirectory: 'dist',
    rewrites: [{source: '/api/:path*', destination: `${url.origin}/api/:path*`}],
    headers: [{source: '/api/:path*', headers: [
      {key: 'Cache-Control', value: 'private, no-store'},
      {key: 'x-vercel-enable-rewrite-caching', value: '0'},
    ]}],
  };
}
