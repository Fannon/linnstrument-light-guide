export const log = {
  info: (msg) => {
    console.info(msg)
    const logEntry = document.createElement("div");
    logEntry.classList = 'log-entry log-info'
    logEntry.innerHTML = `<small class="text-muted">${getTime()}</small> <span class="msg">${msg}</span>`;
    document.getElementById("log").appendChild(logEntry);
  },
  warn: (msg) => {
    console.warn(msg)
    const logEntry = document.createElement("div");
    logEntry.classList = 'log-entry log-warn'
    logEntry.innerHTML = `<small class="text-muted">${getTime()}</small> <span class="msg">${msg}</span>`;
    document.getElementById("log").appendChild(logEntry);
  },
  error: (msg) => {
    console.error(msg)
    logEntry.classList = 'log-entry log-error'
    logEntry.innerHTML = `<small class="text-muted">${getTime()}</small> <span class="msg">${msg}</span>`;
    logEntry.appendChild(textNode);
    document.getElementById("log").appendChild(logEntry);
  }
}

function getTime() {
  return new Date().toISOString().split('T')[1].split('.')[0]
}
