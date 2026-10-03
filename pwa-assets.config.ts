// Generates favicon and PWA icons from public/logo.svg:
//   npm run generate-pwa-assets
// The logo is full-bleed with its content inside the maskable safe zone, so no
// padding is added and the same art serves every icon type.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

const background = '#02040c'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background } },
  },
  images: ['public/logo.svg'],
})
