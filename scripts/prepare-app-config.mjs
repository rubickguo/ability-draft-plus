import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))

const publicBuild = process.argv.includes('--public')
if (!publicBuild) dotenv.config({ path: resolve(__dirname, '../.env') })
const setting = (key) => publicBuild ? '' : (process.env[key] || '')

const config = {
  API_ENDPOINT_URL: setting('API_ENDPOINT_URL'),
  CLIENT_API_KEY: setting('CLIENT_API_KEY'),
  CLIENT_SHARED_SECRET: setting('CLIENT_SHARED_SECRET'),
  SENTRY_DSN: setting('SENTRY_DSN'),
  CLIENT_TAG: setting('CLIENT_TAG'),
  // Optional override; empty => the app's DEFAULT_TWITCH_EBS_URL
  TWITCH_EBS_URL: setting('TWITCH_EBS_URL'),
}

const OPTIONAL_KEYS = new Set(['TWITCH_EBS_URL'])

const missing = Object.entries(config)
  .filter(([k, v]) => !v && !OPTIONAL_KEYS.has(k))
  .map(([k]) => k)

if (missing.length > 0) {
  console.warn(`Warning: Missing API config keys: ${missing.join(', ')}`)
  console.warn('The built app will run without the corresponding features.')
}

const outPath = resolve(__dirname, '../resources/app-config.json')
writeFileSync(outPath, JSON.stringify(config, null, 2), 'utf-8')
console.log('Build: resources/app-config.json generated successfully.')
