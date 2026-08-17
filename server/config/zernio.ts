import {Zernio} from '@zernio/node'
import { env } from './env.js'

// ZERNIO_API_KEY is validated as required at boot, so it is guaranteed present.
const zernio = new Zernio({
    apiKey: env.zernioApiKey,
    baseURL: "https://zernio.com/api"
})

export default zernio
