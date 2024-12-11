const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  brand_name:{
    type: String,
    required: true
  },
  brand_status:{
    type: String,
    required: true
  }

},{timestamps: true});

module.exports = mongoose.model('brand',brandSchema)