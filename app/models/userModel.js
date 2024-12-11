const mongoose = require('mongoose')

const wishListSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
    required: true
  },
},{timestamps: true})

const cartSchema = new mongoose.Schema({
  item: String,
  quantity: {
    type: Number,
    default: 1,
  },
});

const userSchema = mongoose.Schema({
  username : {
    type : String,
    required : true,
    unique : true
  },
  email : {
    type : String,
    required : true,
    unique : true
  },
  password : {
    type : String,
    required : false,
  },
  googleId : {
    type: String,
    unique: true,
    sparse: true
  },
  user_status: String,
  isBlocked: {
    type: Boolean,
    default: false
  },
  phone: String,
  fullname: String,
  address_list: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'address'
  }],
  default_address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'address'
  },
  selected_address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'address'
  },
  wishlist:[wishListSchema],
  cart:[cartSchema],
  payment_methods: [],
  coupons:[],
  wallet: {
    type: Number,
    default: 0
  },
},{timestamps:true})

module.exports = mongoose.model('user',userSchema)