const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/janithya_db')
  .then(async () => {
    console.log('Connected to DB');
    const indexes = await mongoose.connection.collection('payments').indexes();
    console.log(JSON.stringify(indexes, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
