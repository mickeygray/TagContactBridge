const PREFIX = '[RingBridge]';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}

function ts() {
  return `${colors.gray}${timestamp()}${colors.reset}`;
}

module.exports = {
  info: (...args) => console.log(`${colors.cyan}${PREFIX}${colors.reset} ${ts()}`, ...args),
  success: (...args) => console.log(`${colors.green}${PREFIX}${colors.reset} ${ts()}`, ...args),
  warn: (...args) => console.warn(`${colors.yellow}${PREFIX}${colors.reset} ${ts()}`, ...args),
  error: (...args) => console.error(`${colors.red}${PREFIX}${colors.reset} ${ts()}`, ...args),
  event: (extensionId, msg) => console.log(`${colors.blue}${PREFIX}${colors.reset} ${ts()} [ext:${extensionId}]`, msg),
  webhook: (...args) => console.log(`${colors.green}${PREFIX} ⚡${colors.reset} ${ts()}`, ...args),

  // Pipeline logging — one line per stage with consistent format
  // Usage: log.pipe('CALL-START', 'Phil Olson', 'Outbound → (310)555-1234')
  pipe: (stage, agent, detail) => {
    console.log(`${colors.magenta}${PREFIX} ▸${colors.reset} ${ts()} ${colors.white}[${stage}]${colors.reset} ${agent || ''} ${colors.gray}${detail || ''}${colors.reset}`);
  },
  // Green checkmark variant for completed stages
  pipeOk: (stage, agent, detail) => {
    console.log(`${colors.green}${PREFIX} ✔${colors.reset} ${ts()} ${colors.white}[${stage}]${colors.reset} ${agent || ''} ${colors.gray}${detail || ''}${colors.reset}`);
  },
  // Red X variant for failed stages
  pipeFail: (stage, agent, detail) => {
    console.log(`${colors.red}${PREFIX} ✘${colors.reset} ${ts()} ${colors.white}[${stage}]${colors.reset} ${agent || ''} ${colors.gray}${detail || ''}${colors.reset}`);
  },
  // Skip variant
  pipeSkip: (stage, agent, detail) => {
    console.log(`${colors.yellow}${PREFIX} ⊘${colors.reset} ${ts()} ${colors.white}[${stage}]${colors.reset} ${agent || ''} ${colors.gray}${detail || ''}${colors.reset}`);
  },
};
