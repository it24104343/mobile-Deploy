const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`⚠️  Warning: MongoDB connection failed: ${error.message}`);
    console.log('⚠️  Server will continue without database. Some features may not work.');
    // Don't exit - allow server to continue
  }
};

module.exports = connectDB;

