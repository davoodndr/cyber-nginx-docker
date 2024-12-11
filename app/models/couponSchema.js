const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema({
	coupon_code: { type: String, required: true, unique: true },
	discount_type: { type: String, enum: ["percentage", "fixed"], required: true },
	coupon_status: {
		type:String, 
		enum: ['active', 'disabled', 'expired'],
    default: 'active',
	},
	discount_value: { type: Number, required: true },
  min_cart_value: { type: Number, required: true },
  max_redeemable: { type: Number, required: true },
  start_date: { type: Date, required: true },
	end_date: { type: Date, required: true },
	usage_limit: { type: Number, default: 1 },
	times_used: { type: Number, default: 0 },
  description: { type: String},
  applied_products: [{ type: mongoose.Schema.Types.ObjectId, ref: "product" }],
},{timestamps: true});

module.exports = mongoose.model("coupon", CouponSchema);
