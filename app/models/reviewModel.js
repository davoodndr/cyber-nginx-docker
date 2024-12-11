const mongoose = require("mongoose");

const reviewSchema = mongoose.Schema({
	productId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "product",
		required: true,
	},
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "user",
		required: true,
	},
	rating: { 
    type: Number,
    min: 1,
    max: 5, 
    required: true
  },
	reviewTitle: { 
    type: String,
    required: true
  },
	reviewText: { 
    type: String,
    required: true
  },
	date: { 
    type: Date,
    default: Date.now
  },
},{timestamps:true});

module.exports = mongoose.model("review", reviewSchema);
