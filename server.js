const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Import the feedback handler
const { handleFeedback } = require('./src/pages/api/mlmp/feedback-handler');
const { handleTraining } = require('./src/pages/api/mlmp/train');

// API Routes
app.post('/api/mlmp/feedback', handleFeedback);
app.post('/api/mlmp/train', handleTraining);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on open ohttp://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
