const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
 
// Middleware
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI , {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// Trade Schema
const tradeSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['crypto', 'stock', 'nifty', 'options', 'swing']
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  action: {
    type: String,
    required: true,
    enum: ['buy', 'sell']
  },
  quantity: {
    type: Number,
    required: true
  },
  entryPrice: {
    type: Number,
    required: true
  },
  exitPrice: {
    type: Number,
    default: null
  },
  date: {
    type: Date,
    required: true
  },
  notes: {
    type: String,
    default: ''
  },
  strategy: {
    type: String,
    required: true,
    enum: ['swing', 'day', 'scalp', 'position']
  },
  userId: {
    type: String,
    required: true,
    default: 'default-user' // For single user app, can be expanded for multi-user
  }
}, {
  timestamps: true
});  

// Add indexes for better query performance
tradeSchema.index({ userId: 1, date: -1 });
tradeSchema.index({ type: 1 });

const Trade = mongoose.model('Trade', tradeSchema);

// Routes

// GET all trades
app.get('/api/trades', async (req, res) => {
  try {
    const { type, userId = 'default-user' } = req.query;
    const filter = { userId };
    
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    const trades = await Trade.find(filter).sort({ date: -1 });
    res.json({ success: true, data: trades });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single trade
app.get('/api/trades/:id', async (req, res) => {
  try {
    const trade = await Trade.findById(req.params.id);
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    res.json({ success: true, data: trade });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create new trade
app.post('/api/trades', async (req, res) => {
  try {
    const trade = new Trade({
      ...req.body,
      userId: req.body.userId || 'default-user'
    });
    
    await trade.save();
    res.status(201).json({ success: true, data: trade });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
 
// PUT update trade
app.put('/api/trades/:id', async (req, res) => {
  try {
    const trade = await Trade.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    
    res.json({ success: true, data: trade });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PATCH update specific field (like exitPrice)
app.patch('/api/trades/:id', async (req, res) => {
  try {
    const trade = await Trade.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    
    res.json({ success: true, data: trade });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE trade
app.delete('/api/trades/:id', async (req, res) => {
  try {
    const trade = await Trade.findByIdAndDelete(req.params.id);
    
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    
    res.json({ success: true, message: 'Trade deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET statistics
app.get('/api/trades/stats/summary', async (req, res) => {
  try {
    const { userId = 'default-user' } = req.query;
    
    const trades = await Trade.find({ userId, exitPrice: { $ne: null } });
    
    let totalProfit = 0;
    let wins = 0;
    let losses = 0;
    
    trades.forEach(trade => {
      const pnl = (trade.exitPrice - trade.entryPrice) * trade.quantity;
      const finalPnl = trade.action === 'sell' ? -pnl : pnl;
      
      totalProfit += finalPnl;
      
      if (finalPnl > 0) {
        wins++;
      } else if (finalPnl < 0) {
        losses++;
      }
    });
    
    const stats = {
      total: trades.length,
      profit: totalProfit.toFixed(2),
      loss: losses,
      wins: wins,
      winRate: trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : 0
    };
    
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET trades by date range
app.get('/api/trades/filter/daterange', async (req, res) => {
  try {
    const { startDate, endDate, userId = 'default-user' } = req.query;
    
    const filter = { userId };
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    
    const trades = await Trade.find(filter).sort({ date: -1 });
    res.json({ success: true, data: trades });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Trade Journal API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

