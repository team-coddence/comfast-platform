import {v2 as cloudinary} from 'cloudinary'
import { env, isServiceConfigured } from './env.js'

export const isCloudinaryConfigured = () => isServiceConfigured("cloudinary");

if (isCloudinaryConfigured()) {
    cloudinary.config({
        cloud_name: env.cloudinary.cloudName,
        api_key: env.cloudinary.apiKey,
        api_secret: env.cloudinary.apiSecret,
    })
}

export {cloudinary};
