const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Payment = require('./models/Payment');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const payments = await Payment.find().sort({ createdAt: -1 }).limit(10).lean();
    console.log("Recent Payments:");
    payments.forEach(p => console.log(p._id, p.enrollment, p.month, p.year, p.amount, p.status));
    
    // Find payments with NaN or null or missing
    const weirdPayments = await Payment.find({
        $or: [
            { month: { $in: [null, NaN, 0] } },
            { month: { $exists: false } },
            { year: { $in: [null, NaN, 0] } },
            { year: { $exists: false } }
        ]
    }).lean();
    console.log("Weird Payments count:", weirdPayments.length);
    if(weirdPayments.length > 0) {
        console.log("Sample Weird Payment:", weirdPayments[0]);
    }

    process.exit(0);
  });
