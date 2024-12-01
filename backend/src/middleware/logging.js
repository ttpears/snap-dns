function requestLogger(req, res, next) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
}

module.exports = {
    requestLogger
}; 