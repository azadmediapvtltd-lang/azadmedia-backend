const express = require('express');
const mongoose = require('mongoose');

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Ensure DB is connected before handling any requests
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (e) {
        res.status(500).json({ error: 'DB Connection Failed: ' + e.message });
    }
});

const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Default Route


const jwt = require('jsonwebtoken');

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

// --- Login Route ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || 'azadozalive@admin.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AOLadmin@123';

    if (email === adminEmail && password === adminPassword) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid email or password' });
    }
});

app.get('/test-db', async (req, res) => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        res.json({ status: 'connected to mongo successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

app.get('/debug-env', (req, res) => { res.json({ hasMongo: !!process.env.MONGO_URI, prefix: process.env.MONGO_URI ? process.env.MONGO_URI.substring(0, 15) : null }); });
app.get('/', (req, res) => {
    res.send('API is running successfully on Vercel!');
});

// MongoDB Connection

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB Connected Successfully!'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// Models
const NewsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    category: { type: String, default: 'General' },
    blocks: { type: Array, default: [] }, // e.g. [{ type: 'text', value: '...' }]
    createdAt: { type: Date, default: Date.now }
});
const News = mongoose.model('News', NewsSchema);

const SettingSchema = new mongoose.Schema({
    footerAbout: { type: String, default: 'AZAD MEDIA LIVE is a leading news portal.' },
    footerTagline: { type: String, default: 'સમાચાર હરપળ... સતત અને ઝડપી...' },
    contactEmail: { type: String, default: 'contact@azadmedialive.com' },
    contactAddress: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    copyrightText: { type: String, default: '© 2024 AZAD MEDIA LIVE. All Rights Reserved.' },
    sidebarAdUrl: { type: String, default: '' }, // legacy
    sidebarAdId: { type: String, default: '' },
    inBetweenAds: { type: [String], default: [] },
    socialLinks: {
        facebook: { type: String, default: '#' },
        twitter: { type: String, default: '#' },
        instagram: { type: String, default: '#' },
        youtube: { type: String, default: '#' }
    }
});
const Setting = mongoose.model('Setting', SettingSchema);

const AdSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['banner', 'video', 'in_between_banner', 'in_between_video', 'right_side_fix'], default: 'in_between_banner' },
    contentUrl: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Ad = mongoose.model('Ad', AdSchema);

// Setup Cloudinary for File Uploads
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'azadnews',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif']
  },
});
const upload = multer({ storage: storage });

// Serve uploaded files statically (just in case)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File Upload Route
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ url: req.file.path }); // Cloudinary returns URL in req.file.path
});

// Routes for Ads
app.get('/api/ads', async (req, res) => {
    try {
        const ads = await Ad.find().sort({ createdAt: -1 });
        res.json(ads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ads', authenticateToken, async (req, res) => {
    try {
        const newAd = new Ad(req.body);
        const savedAd = await newAd.save();
        res.status(201).json(savedAd);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/ads/:id', authenticateToken, async (req, res) => {
    try {
        await Ad.findByIdAndDelete(req.params.id);
        res.json({ message: 'Ad deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/ads/:id', authenticateToken, async (req, res) => {
    try {
        const updatedAd = await Ad.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );
        res.json(updatedAd);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Routes for News
app.get('/api/news', async (req, res) => {
    try {
        const news = await News.find().sort({ createdAt: -1 });
        res.json(news);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/news', authenticateToken, async (req, res) => {
    try {
        const newNews = new News(req.body);
        const savedNews = await newNews.save();
        res.status(201).json(savedNews);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/news/:id', authenticateToken, async (req, res) => {
    try {
        await News.findByIdAndDelete(req.params.id);
        res.json({ message: 'News deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/news/:id', authenticateToken, async (req, res) => {
    try {
        const updatedNews = await News.findByIdAndUpdate(
            req.params.id, 
            { $set: req.body }, 
            { new: true }
        );
        res.json(updatedNews);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Routes for Settings
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (!settings) {
            settings = await Setting.create({}); // Create default if doesn't exist
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (settings) {
            settings.footerAbout = req.body.footerAbout || settings.footerAbout;
            settings.footerTagline = req.body.footerTagline !== undefined ? req.body.footerTagline : settings.footerTagline;
            settings.contactEmail = req.body.contactEmail || settings.contactEmail;
            settings.contactAddress = req.body.contactAddress !== undefined ? req.body.contactAddress : settings.contactAddress;
            settings.contactPhone = req.body.contactPhone !== undefined ? req.body.contactPhone : settings.contactPhone;
            settings.copyrightText = req.body.copyrightText !== undefined ? req.body.copyrightText : settings.copyrightText;
            settings.sidebarAdUrl = req.body.sidebarAdUrl !== undefined ? req.body.sidebarAdUrl : settings.sidebarAdUrl;
            settings.sidebarAdId = req.body.sidebarAdId !== undefined ? req.body.sidebarAdId : settings.sidebarAdId;
            if (req.body.inBetweenAds !== undefined) {
                settings.inBetweenAds = req.body.inBetweenAds;
            }
            if (req.body.socialLinks) {
                settings.socialLinks = { ...settings.socialLinks, ...req.body.socialLinks };
            }
            const updatedSettings = await settings.save();
            res.json(updatedSettings);
        } else {
            const newSettings = await Setting.create(req.body);
            res.status(201).json(newSettings);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
