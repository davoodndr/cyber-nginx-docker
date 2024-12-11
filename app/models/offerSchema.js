const mongoose = require("mongoose");

const OfferSchema = new mongoose.Schema({
	offer_code: { type: String, required: true, unique: true },
  offer_type: {
    type: String, 
    enum:['product','category','referal'],
    default: 'product',    
  },
	discount_type: {
    type: String,
    enum: ["percentage", "fixed"],
    default: 'percentage'
  },
	offer_status: {
		type:String, 
		enum: ['active', 'disabled', 'ended'],
    default: 'active',
	},
	discount_value: { type: Number, required: true },
  start_date: { type: Date, required: true },
	end_date: { type: Date, required: true },
  description: { type: String},
  applied_products: [{ type: mongoose.Schema.Types.ObjectId, ref: "product" }],
  applied_categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "category" }],
  referal_code: String,
},{timestamps: true});

module.exports = mongoose.model("offer", OfferSchema);