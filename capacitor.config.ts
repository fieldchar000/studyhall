// The Android app: Capacitor wraps the phone build (npm run build:mobile → out/mobile) in a
// native shell. The android/ folder is generated once by Capacitor and kept in git.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.studyhall.app',
  appName: 'Studyhall',
  webDir: 'out/mobile',
  android: {
    backgroundColor: '#0f1311'
  }
}

export default config
