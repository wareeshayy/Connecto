const express = require('express');
const { auth } = require('../middleware/auth');
const Post = require('../models/Post');
const router = express.Router();

// Get all posts
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate('user', 'name email avatar')
      .populate({
        path: 'comments',
        populate: {
          path: 'user',
          select: 'name avatar'
        }
      });

    res.json({
      success: true,
      posts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// Create a post
router.post('/', auth, async (req, res) => {
  try {
    const { content, image, tags, location } = req.body;

    const newPost = new Post({
      user: req.user.id,
      content,
      image,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      location
    });

    const post = await newPost.save();

    // Populate user details for the response and socket event
    await post.populate('user', 'name email avatar');

    // Emit socket event
    const io = req.app.get('io');
    io.emit('new_post', post);

    res.json({
      success: true,
      post
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

module.exports = router;