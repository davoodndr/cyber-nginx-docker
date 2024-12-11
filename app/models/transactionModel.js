const mongoose = require('mongoose');

const transactionModel = mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  transaction_id: {
    type: String,
    required: true,
    unique: true,
  },
  payment_method: String,
  transaction_type: {
    type: String,
    enum: ['deposit', 'withdraw'],
    required: true
  },
  transaction_amount: {
    type: Number,
    default: 0
  },
  transaction_date: {
    type: Date,
    default: Date.now()
  },
  current_balance: {
    type: Number,
    default: 0
  },
  description: String,
},{timestamps: true})

module.exports = mongoose.model('transaction', transactionModel)