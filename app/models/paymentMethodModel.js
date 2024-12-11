const mongoose = require('mongoose');

const paymentMethodSchema = mongoose.Schema({
  
  type: String,
  number: String,
  expiry_date: Date,
  cvv: String,
  logo: String
})


module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);