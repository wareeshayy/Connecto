// ===============================================
// STEP 2: Create models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true 
  },
  password: { 
    type: String, 
    required: function() { return !this.googleId; }
  },
  bio: {
    type: String,
    maxlength: 500,
    trim: true,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'premium', 'admin', 'moderator'],
    default: 'user'
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  isActive: {
    type: Boolean,
    default: true
  },
  otp: { 
    type: String 
  },
  otpExpires: { 
    type: Date 
  },
  googleId: { 
    type: String,
    sparse: true
  },
  avatar: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  coverImage: {
    type: String,
    default: null
  },
  location: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  followers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    followedAt: {
      type: Date,
      default: Date.now
    }
  }],
  following: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    followedAt: {
      type: Date,
      default: Date.now
    }
  }],
  followersCount: {
    type: Number,
    default: 0
  },
  followingCount: {
    type: Number,
    default: 0
  },
  postsCount: {
    type: Number,
    default: 0
  },
  privacy: {
    profileVisibility: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public'
    },
    showEmail: {
      type: Boolean,
      default: false
    },
    showFollowers: {
      type: Boolean,
      default: true
    },
    allowMessagesFrom: {
      type: String,
      enum: ['everyone', 'friends', 'none'],
      default: 'everyone'
    }
  },
  settings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    darkMode: {
      type: Boolean,
      default: false
    },
    language: {
      type: String,
      default: 'en'
    },
    twoFactorAuth: {
      enabled: {
        type: Boolean,
        default: false
      },
      secret: String,
      backupCodes: [String]
    }
  },
  lastLogin: {
    type: Date
  },
  ipAddress: {
    type: String
  },
  device: {
    type: String
  },
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],
  passwordResetToken: String,
  passwordResetExpires: Date,
  accountDeactivatedAt: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  emailVerificationToken: String,
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
UserSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Increment login attempts
UserSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: {
        loginAttempts: 1
      },
      $unset: {
        lockUntil: 1
      }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Reset login attempts
UserSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: {
      loginAttempts: 1,
      lockUntil: 1
    }
  });
};

// Follow user method
UserSchema.methods.followUser = function(userId) {
  const isFollowing = this.following.some(follow => follow.user.toString() === userId.toString());
  if (!isFollowing) {
    this.following.push({ user: userId });
    this.followingCount += 1;
  }
};

// Unfollow user method
UserSchema.methods.unfollowUser = function(userId) {
  const followIndex = this.following.findIndex(follow => follow.user.toString() === userId.toString());
  if (followIndex > -1) {
    this.following.splice(followIndex, 1);
    this.followingCount -= 1;
  }
};

// Check if following user
UserSchema.methods.isFollowing = function(userId) {
  return this.following.some(follow => follow.user.toString() === userId.toString());
};

// Add follower method
UserSchema.methods.addFollower = function(userId) {
  const isFollower = this.followers.some(follow => follow.user.toString() === userId.toString());
  if (!isFollower) {
    this.followers.push({ user: userId });
    this.followersCount += 1;
  }
};

// Remove follower method
UserSchema.methods.removeFollower = function(userId) {
  const followerIndex = this.followers.findIndex(follow => follow.user.toString() === userId.toString());
  if (followerIndex > -1) {
    this.followers.splice(followerIndex, 1);
    this.followersCount -= 1;
  }
};

// Generate avatar from name
UserSchema.methods.generateAvatar = function() {
  const name = encodeURIComponent(this.name);
  return `https://ui-avatars.com/api/?name=${name}&background=7c3aed&color=fff&size=150`;
};

// Update avatar if not set
UserSchema.pre('save', function(next) {
  if (this.isNew && this.avatar === 'https://via.placeholder.com/150') {
    this.avatar = this.generateAvatar();
  }
  next();
});

// Index for efficient querying
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ followersCount: -1 });
UserSchema.index({ postsCount: -1 });

module.exports = mongoose.model('User', UserSchema);
