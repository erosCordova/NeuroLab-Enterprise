export function createDeploymentConfig(value) {
  if (!value) throw new Error('Falta NEUROLAB_API_ORIGIN: usa la URL verificada del backend Render.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.onrender\.com$/.test(url.hostname)
      || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEUROLAB_API_ORIGIN debe ser un origen HTTPS de Render, sin rutas ni credenciales.');
  }
  return {
    framework: 'vite',
    buildCommand: 'VITE_RELEASE_SHA=$VERCEL_GIT_COMMIT_SHA VITE_USE_API=true VITE_API_BASE_URL=/api/v1 npm run build',
    outputDirectory: 'dist',
    rewrites: [
      {source: '/api/:path*', destination: `${url.origin}/api/:path*`},
      {source: '/datasets/mnist/train-images-idx3-ubyte.gz', destination: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-images-idx3-ubyte.gz'},
      {source: '/datasets/mnist/train-labels-idx1-ubyte.gz', destination: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-labels-idx1-ubyte.gz'},
      {source: '/datasets/mnist/t10k-images-idx3-ubyte.gz', destination: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-images-idx3-ubyte.gz'},
      {source: '/datasets/mnist/t10k-labels-idx1-ubyte.gz', destination: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-labels-idx1-ubyte.gz'},
    ],
    headers: [
      {source: '/api/:path*', headers: [
        {key: 'Cache-Control', value: 'private, no-store'},
        {key: 'x-vercel-enable-rewrite-caching', value: '0'},
      ]},
      {source: '/(.*)', headers: [
        {key: 'X-Content-Type-Options', value: 'nosniff'},
        {key: 'X-Frame-Options', value: 'DENY'},
        {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
        {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
        {key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://storage.googleapis.com; font-src 'self' data:; worker-src 'self' blob:"},
      ]},
    ],
  };
}
