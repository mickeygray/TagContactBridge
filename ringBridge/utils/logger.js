const PREFIX = '[RingBridge]';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}

module.exports = {
  info: (...args) => console.log(`${colors.cyan}${PREFIX}${colors.reset} ${colors.gray}${timestamp()}${colors.reset}`, ...args),
  success: (...args) => console.log(`${colors.green}${PREFIX}${colors.reset} ${colors.gray}${timestamp()}${colors.reset}`, ...args),
  warn: (...args) => console.warn(`${colors.yellow}${PREFIX}${colors.reset} ${colors.gray}${timestamp()}${colors.reset}`, ...args),
  error: (...args) => console.error(`${colors.red}${PREFIX}${colors.reset} ${colors.gray}${timestamp()}${colors.reset}`, ...args),
  event: (extensionId, msg) => console.log(`${colors.blue}${PREFIX}${colors.reset} ${colors.gray}${timestamp()}${colors.reset} [ext:${extensionId}]`, msg),
  webhook: (...args) => console.log(`${colors.green}${PREFIX} ⚡${colors.reset} ${colors.gray}${timestamp()}${colors.reset}`, ...args)
};
