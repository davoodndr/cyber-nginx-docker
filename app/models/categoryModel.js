const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  category_name:{
    type: String,
    required: true,
    unique:true
  },
  category_status:{
    type: String,
    required: true
  },
  is_deleted:{
    type: Boolean,
    default: false
  }

},{timestamps: true});

const Category =  mongoose.model('category',categorySchema)

module.exports = Category;