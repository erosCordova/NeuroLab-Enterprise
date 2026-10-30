import {createDeploymentConfig} from './deployment-config.mjs';

/** @type {import('@vercel/config/v1').VercelConfig} */
export const config = createDeploymentConfig(process.env.NEUROLAB_API_ORIGIN);
