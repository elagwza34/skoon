// Test-process-only workaround for a Windows host defect where Node 24's
// os.userInfo() throws uv_os_get_passwd ENOMEM before tsx can load. It preserves
// the native result whenever it works and supplies only process-local metadata
// in that specific failure case. Load with: node --require ./tests/node-userinfo-workaround.cjs …
const os = require('node:os')
const nativeUserInfo = os.userInfo.bind(os)

os.userInfo = function userInfo(options) {
  try {
    return nativeUserInfo(options)
  } catch (error) {
    if (error && error.code === 'ERR_SYSTEM_ERROR' && error.info && error.info.syscall === 'uv_os_get_passwd') {
      return {
        uid: -1,
        gid: -1,
        username: process.env.USERNAME || 'test-runner',
        homedir: process.env.USERPROFILE || process.cwd(),
        shell: null,
      }
    }
    throw error
  }
}
