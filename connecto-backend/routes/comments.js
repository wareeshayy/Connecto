const express = require('express');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

// @route   GET /api/comments/post/:postId
// @desc    Get comments for a specific post
// @access  Public
router.get('/post/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }

    // Get top-level comments (not replies)
    const comments = await Comment.find({ 
      post: postId, 
      parentComment: null,
      isDeleted: false 
    })
    .populate('user', 'name avatar role')
    .populate({
      path: 'replies',
      populate: {
        path: 'user',
        select: 'name avatar role'
      },
      options: { 
        match: { isDeleted: false },
        limit: 3, 
        sort: { createdAt: 1 } 
      }
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

    const totalComments = await Comment.countDocuments({ 
      post: postId, 
      parentComment: null,
      isDeleted: false 
    });

    res.json({
      success: true,
      comments,
      currentPage: page,
      totalPages: Math.ceil(totalComments / limit),
      totalComments
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// @route   GET /api/comments/:commentId/replies
// @desc    Get replies for a specific comment
// @access  Public
router.get('/:commentId/replies', async (req, res) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if parent comment exists
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    const replies = await Comment.find({ 
      parentComment: commentId,
      isDeleted: false 
    })
    .populate('user', 'name avatar role')
    .sort({ createdAt: 1 })
    .limit(limit)
    .skip(skip);

    const totalReplies = await Comment.countDocuments({ 
      parentComment: commentId,
      isDeleted: false 
    });

    res.json({
      success: true,
      replies,
      currentPage: page,
      totalPages: Math.ceil(totalReplies / limit),
      totalReplies
    });

  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// @route   POST /api/comments
// @desc    Create a new comment
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { postId, content, parentCommentId } = req.body;

    if (!postId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Post ID is required' 
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment content is required' 
      });
    }

    if (content.length > 500) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment cannot exceed 500 characters' 
      });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }

    // If it's a reply, check if parent comment exists
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Parent comment not found' 
        });
      }
      
      // Make sure parent comment belongs to the same post
      if (parentComment.post.toString() !== postId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Parent comment does not belong to this post' 
        });
      }
    }

    // Create comment
    const comment = new Comment({
      post: postId,
      user: req.user.id,
      content: content.trim(),
      parentComment: parentCommentId || null
    });

    await comment.save();
    await comment.populate('user', 'name avatar role');

    // Update post's comment count if it's a top-level comment
    if (!parentCommentId) {
      await Post.findByIdAndUpdate(postId, { 
        $inc: { commentsCount: 1 },
        $push: { comments: comment._id }
      });
    } else {
      // Update parent comment's reply count and add to replies array
      await Comment.findByIdAndUpdate(parentCommentId, {
        $inc: { repliesCount: 1 },
        $push: { replies: comment._id }
      });
    }

    res.status(201).json({
      success: true,
      message: parentCommentId ? 'Reply added successfully' : 'Comment added successfully',
      comment
    });

  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// @route   PUT /api/comments/:id
// @desc    Update a comment
// @access  Private (Only comment owner or admin)
router.put('/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment content is required' 
      });
    }

    if (content.length > 500) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment cannot exceed 500 characters' 
      });
    }

    let comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot edit deleted comment' 
      });
    }

    // Check if user owns the comment or is admin
    const user = await User.findById(req.user.id);
    if (comment.user.toString() !== req.user.id && user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to edit this comment' 
      });
    }

    comment.content = content.trim();
    comment.edited = true;
    comment.editedAt = new Date();

    await comment.save();
    await comment.populate('user', 'name avatar role');

    res.json({
      success: true,
      message: 'Comment updated successfully',
      comment
    });

  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// @route   DELETE /api/comments/:id
// @desc    Delete a comment (soft delete)
// @access  Private (Only comment owner or admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment is already deleted' 
      });
    }

    // Check if user owns the comment or is admin
    const user = await User.findById(req.user.id);
    if (comment.user.toString() !== req.user.id && user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this comment' 
      });
    }

    // Soft delete the comment
    comment.isDeleted = true;
    comment.content = '[Comment deleted]';
    await comment.save();

    // Update post's comment count if it's a top-level comment
    if (!comment.parentComment) {
      await Post.findByIdAndUpdate(comment.post, { 
        $inc: { commentsCount: -1 },
        $pull: { comments: comment._id }
      });
    } else {
      // Update parent comment's reply count
      await Comment.findByIdAndUpdate(comment.parentComment, {
        $inc: { repliesCount: -1 },
        $pull: { replies: comment._id }
      });
    }

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// @route   POST /api/comments/:id/like
// @desc    Like/Unlike a comment
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot like deleted comment' 
      });
    }

    const hasLiked = comment.hasUserLiked(req.user.id);
    
    if (hasLiked) {
      // Unlike the comment
      comment.removeLike(req.user.id);
      await comment.save();
      
      res.json({
        success: true,
        message: 'Comment unliked',
        liked: false,
        likesCount: comment.likesCount
      });
    } else {
      // Like the comment
      comment.addLike(req.user.id);
      await comment.save();
      
      res.json({
        success: true,
        message: 'Comment liked',
        liked: true,
        likesCount: comment.likesCount
      });
    }

  } catch (error) {
    console.error('Like comment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// @route   GET /api/comments/:id/likes
// @desc    Get users who liked a comment
// @access  Private
router.get('/:id/likes', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
      .populate('likes.user', 'name avatar role');

    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    const likes = comment.likes.map(like => ({
      user: like.user,
      likedAt: like.createdAt
    }));

    res.json({
      success: true,
      likes,
      totalLikes: comment.likesCount
    });

  } catch (error) {
    console.error('Get comment likes error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// @route   GET /api/comments/user/:userId
// @desc    Get user's comments
// @access  Private (Only for own comments or admin)
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check authorization - only user themselves or admin can view
    const user = await User.findById(req.user.id);
    if (req.user.id !== userId && user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view these comments' 
      });
    }

    const comments = await Comment.find({ 
      user: userId,
      isDeleted: false
    })
    .populate('user', 'name avatar role')
    .populate('post', 'content user')
    .populate({
      path: 'post',
      populate: {
        path: 'user',
        select: 'name avatar'
      }
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

    const totalComments = await Comment.countDocuments({ 
      user: userId,
      isDeleted: false 
    });

    res.json({
      success: true,
      comments,
      currentPage: page,
      totalPages: Math.ceil(totalComments / limit),
      totalComments
    });

  } catch (error) {
    console.error('Get user comments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;
