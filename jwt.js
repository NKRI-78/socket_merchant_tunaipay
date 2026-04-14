require('dotenv').config();

const jwt = require('jsonwebtoken');
const misc = require('./response');

/**
 * JWT Middleware - Validates token in Authorization header
 */
const jwtF = (req, res, next) => {
  const header = req.header('Authorization');

  if (!header || header === 'Bearer null') {
    return misc.response(res, 401, true, 'No token, authorization denied.');
  }

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return misc.response(res, 401, true, 'Invalid authorization format.');
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Token expired.'
          : err.name === 'JsonWebTokenError'
            ? 'Invalid token.'
            : 'Token verification failed.';
      return misc.response(res, 401, true, message);
    }

    req.decoded = decoded;
    next();
  });
};

module.exports = { jwtF };
