const getLogLevel = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('LOG_LEVEL') || 'info';
  }
  return 'info';
};

const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 100
};

class BrowserLogger {
  constructor(config = {}) {
    this.level = config.level || getLogLevel();
    this.bindings = config.bindings || {};
    this.name = config.name || '';
  }

  get levelValue() {
    return LOG_LEVELS[this.level] || LOG_LEVELS.info;
  }

  shouldLog(level) {
    return LOG_LEVELS[level] >= this.levelValue;
  }

  formatMessage(level, obj, msg) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] ${level.toUpperCase()}`;
    
    if (this.name) {
      return `${prefix} [${this.name}]`;
    }
    return prefix;
  }

  log(level, objOrMsg, msg) {
    if (!this.shouldLog(level)) return;

    let logObj = {};
    let logMsg = '';

    if (typeof objOrMsg === 'string') {
      logMsg = objOrMsg;
    } else if (typeof objOrMsg === 'object' && objOrMsg !== null) {
      logObj = { ...this.bindings, ...objOrMsg };
      logMsg = msg || '';
    } else {
      logMsg = String(objOrMsg);
    }

    const prefix = this.formatMessage(level, logObj, logMsg);
    const hasObject = Object.keys(logObj).length > 0;

    const consoleMethod = level === 'error' || level === 'fatal' ? 'error' :
                         level === 'warn' ? 'warn' :
                         level === 'debug' || level === 'trace' ? 'debug' :
                         'log';

    if (hasObject) {
      console[consoleMethod](prefix, logMsg, logObj);
    } else {
      console[consoleMethod](prefix, logMsg);
    }
  }

  trace(objOrMsg, msg) {
    this.log('trace', objOrMsg, msg);
  }

  debug(objOrMsg, msg) {
    this.log('debug', objOrMsg, msg);
  }

  info(objOrMsg, msg) {
    this.log('info', objOrMsg, msg);
  }

  warn(objOrMsg, msg) {
    this.log('warn', objOrMsg, msg);
  }

  error(objOrMsg, msg) {
    this.log('error', objOrMsg, msg);
  }

  fatal(objOrMsg, msg) {
    this.log('fatal', objOrMsg, msg);
  }

  child(bindings) {
    return new BrowserLogger({
      level: this.level,
      bindings: { ...this.bindings, ...bindings },
      name: bindings.name || this.name
    });
  }
}

export const logger = new BrowserLogger();


export function createChildLogger(bindings) {
  return logger.child(bindings);
}

export const logUtils = {
  functionEntry: (functionName, params = {}, childLogger = logger) => {
    childLogger.debug(
      { function: functionName, params },
      `Entering ${functionName}`
    );
  },

  functionExit: (functionName, result, childLogger = logger) => {
    childLogger.debug(
      { function: functionName, result },
      `Exiting ${functionName}`
    );
  },


  progress: (operation, current, total, childLogger = logger) => {
    const percentage = Math.round((current / total) * 100);
    childLogger.info(
      {
        operation,
        progress: { current, total, percentage },
      },
      `${operation}: ${current}/${total} (${percentage}%)`
    );
  },


  timing: (operation, startTime, childLogger = logger) => {
    const duration = Date.now() - startTime;
    childLogger.info(
      { operation, duration },
      `${operation} completed in ${duration}ms`
    );
  },
};


export function setLogLevel(level) {
  logger.level = level;
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('LOG_LEVEL', level);
  }
}

export function disableLogging() {
  logger.level = 'silent';
}

export function enableLogging(level = 'info') {
  logger.level = level;
}

export default logger;
