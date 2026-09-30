// Entry point redirecting to modular src/server.js
const { startServer } = require('./src/server');

if (require.main === module) {
    startServer();
}

module.exports = require('./src/server');