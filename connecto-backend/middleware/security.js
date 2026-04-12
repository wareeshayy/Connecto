const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

// Rate limiting configurations
const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  message: {
    success: false,
    message: 'Too many accounts created from this IP, please try again after an hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 posts per 15 minutes
  message: {
    success: false,
    message: 'Too many posts created, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 comments per 15 minutes
  message: {
    success: false,
    message: 'Too many comments created, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware setup
const setupSecurity = (app) => {
  // Set security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        scriptSrc: ["'self'"],
      },
    },
  }));

  // Prevent NoSQL injection attacks
  app.use(mongoSanitize());

  // XSS protection is now handled by helmet's built-in xss filter

  // Prevent HTTP Parameter Pollution
  app.use(hpp());

  // Apply general rate limiting to all routes
  app.use('/api/', generalLimiter);

  return {
    createAccountLimiter,
    loginLimiter,
    postLimiter,
    commentLimiter
  };
};

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }
    next();
  };
};

// Sanitize HTML content
const sanitizeHtml = (req, res, next) => {
  if (req.body.content) {
    // Remove HTML tags and keep only plain text
    req.body.content = req.body.content.replace(/<[^>]*>/g, '');
  }
  if (req.body.bio) {
    req.body.bio = req.body.bio.replace(/<[^>]*>/g, '');
  }
  next();
};

module.exports = {
  setupSecurity,
  validateInput,
  sanitizeHtml,
  createAccountLimiter,
  loginLimiter,
  postLimiter,
  commentLimiter
};
