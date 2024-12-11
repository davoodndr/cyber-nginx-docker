const mongoose = require('mongoose')

const addressSchema = mongoose.Schema({

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  fullname: String,
  phone: String,
  email: String,
  address: String,
  street: String,
  landmark: String,
  city: String,
  pincode: String,
  state: String,
  country: String,
  isDefault: {
    type: Boolean,
    required: true,
    default: false
  },
})

module.exports = mongoose.model('address',addressSchema)