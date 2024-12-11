const mongoose = require('mongoose')

const orderAddressSchema = mongoose.Schema({

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  address_type: String,
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
})

const cartSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref:'product',
  },
  item_status: {
    type: String,
    enum: ['pending', 'processed', 'shipped', 'delivered', 'cancelled','return'],
    default: 'pending',
  },
  quantity: {
    type: Number,
    default: 1,
  },
  item_tax: {
    type: Number,
    default: 0,
  },
  price: Number,
  coupons: [],
  coupon_amount: {
    type: Number,
    default: 0
  },
  offers: [],
  offer_amount: {
    type: Number,
    default: 0
  },
  refund_amount: {
    type: Number,
    default: 0,
  },
  isRefunded: {
    type: Boolean,
    default: false,
  },
  item_total: Number,
});


const orderSchema = mongoose.Schema({

  order_no: {
    type: String,
    required: true,
    unique: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  payment_method: {
    type: String,
    defaut: 'cod'
  },
  payment_status: {
    type: String,
    enum: ['unpaid', 'paid', 'failed'],
    default: 'unpaid',
  },
  paid_amount: {
    type: Number,
    default: 0
  },
  payment_id: String,
  razorpay_order_id: String,
  order_status: {
    type: String,
    enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled','return','payment pending'],
    default: 'pending',
  },
  order_subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },
  coupon:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'coupon'
  },
  coupon_amount: {
    type: Number,
    default: 0
  },
  offers:[],
  offer_amount: {
    type: Number,
    default: 0
  },
  discounts: {
    type: Number,
    default: 0
  },
  shipping_charge:{
    type: Number,
    default: 100
  },
  order_total: {
    type: Number,
    required: true
  },
  refund_amount: {
    type: Number,
    default: 0,
  },
  isRefunded: {
    type: Boolean,
    default: false,
  },
  cart: [cartSchema],
  billing_address: orderAddressSchema,
  shipping_address: orderAddressSchema,

},{ timestamps: true })

module.exports = mongoose.model('order', orderSchema)