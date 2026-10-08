// electron-builder afterSign hook: castlabs VMP signature, which Widevine (and so Spotify full
// tracks) requires. Must run AFTER any Windows code signing — afterSign is that point.
// Uses the free castlabs EVS account set up with castlabs-signup.cmd (tokens are cached).
// Without an account the build still succeeds; only Spotify full-track playback won't work.

const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

exports.default = async function vmpSign(context) {
  if (context.electronPlatformName !== 'win32') return
  const py = join(__dirname, '..', '.venv', 'Scripts', 'python.exe')
  if (!existsSync(py)) {
    console.warn('  • VMP: no .venv found — skipping castlabs signing (Spotify full tracks will not play)')
    return
  }
  console.log('  • VMP: signing', context.appOutDir)
  const r = spawnSync(py, ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', context.appOutDir], { stdio: 'inherit' })
  if (r.status !== 0) {
    if (process.env.REQUIRE_VMP) throw new Error('castlabs VMP signing failed')
    console.warn('  • VMP: signing failed or no castlabs account yet — continuing unsigned (Spotify full tracks will not play)')
  }
}
