const User = require('../models/userModel');
const Product = require('../models/productModel');
const Coupon = require('../models/couponSchema');
const Offer = require('../models/offerSchema')
const Review = require("../models/reviewModel");
const moment = require('moment');
const mongoose  = require('mongoose');
// Validate Email Format
exports.validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Simple regex for email validation
  return regex.test(email);
};

// Validate Password Strength
exports.validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasDigits = /\d/.test(password);
  const hasSymbol = /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/.test(password);
  if(password.length < minLength) return 'Password requires min. 8 charaters';
  if(!hasUpperCase) return 'Should have uppercase letters'
  if(!hasLowerCase) return 'Should have lowercase letters'
  if(!hasDigits) return 'Should have digits'
  if(!hasSymbol) return 'Should have symbol'
  return password.length >= minLength && hasUpperCase && hasLowerCase && hasDigits;
};

exports.sendResponse = function(status,title,icon,msg,errors={},values={}){
  return {status: status,title: title, icon: icon, msg: msg,errors,values}
}

exports.createSlug = (name) => {
  return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
};

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); // Random index
      // Swap elements
      [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

exports.getCartItemsCount = async (userId) => {
  if(!userId) return 0
  const cartItems = await User.findOne({_id:userId}).populate('cart').then(cart => cart.cart)
  return cartItems.reduce((acc, item) => acc + item.quantity, 0)
}

exports.createToast = function(success = false,icon,msg,errors,values){
  return {success: success, icon: icon, msg: msg,errors,values}
}

exports.generateUniqueId = function () {
  return Math.floor(Math.random() * 1000000); 
}

exports.getWishlistItems = async (userId) => {
  if(!userId) return 0
  const wList = await User.findOne({_id:userId}).populate('wishlist').then(user => user.wishlist)
  const wishlist = wList.map(item => item.product.toString())
  //return cartItems.reduce((acc, item) => acc + item.quantity, 0)
  return wishlist
}

exports.getCartItmes = async (userId) => {

  return new Promise(async (resolve, reject) => {
    
    //const user = await User.findOne({_id:userId});
    const user = await User.findOne({_id:userId}).populate('cart')/* .then(user => cart.user) */

    const cartItems = await Promise.all(user.cart.map(async (cartItem) => {
      const product = await Product.findById(cartItem.item).populate('category');
      const coupons = await Coupon.find({coupon_status:{$nin: ['disabled','expired']},coupon_code:{$nin:user.coupons}})

      const offers = await Offer.find(
        {
          offer_status:'active',
          $or:[
            {applied_products:{$in:[product._id]}},
            {applied_categories:{$in:[product.category._id]}}
          ],
        },
        {discount_type: 1, discount_value:1, offer_type: 1,offer_code:1}
      )
      const offer_value = offers.reduce((acc, curr) => {
        if(curr.discount_type === 'fixed'){
          return acc + curr.discount_value
        }else if(curr.discount_type === 'percentage'){
          return acc + ((curr.discount_value/100) * product.pricing.original_price)
        }
        return 0
      },0)

      return {
        cartItem_id: cartItem._id,
        product_id: product._id,
        name: product.product_name,
        slug: product.product_slug,
        product_status: product.product_status,
        category_status: product.category.category_status,
        category: product.category.category_name,
        stock: product.stock,
        price: product.pricing.original_price,
        max_quantity: product.max_quantity,
        quantity: cartItem.quantity,
        item_tax: (product.tax * cartItem.quantity).toFixed(2),
        item_total: (product.pricing.original_price * cartItem.quantity)/*  - (offer_value * cartItem.quantity) */,
        thumb: product.images[0],
        coupons,
        offers,// to store on place order
        offer_amount : (offer_value * cartItem.quantity),
        offer_count: offers.length
      };
    })).catch(err => reject(err));

    // discount only refers offers now
    const subtotal = cartItems.reduce((acc, curr) => acc + curr.item_total, 0).toFixed(2);
    const tax = cartItems.reduce((acc, curr) => acc + parseFloat(curr.item_tax), 0).toFixed(2);
    const offer_amount = cartItems.reduce((acc, curr) => acc + parseFloat(curr.offer_amount), 0).toFixed(2);
    const offers = cartItems.map(item => item.offers.map(offer=>offer.offer_code)).flat()
    const shippingCharge = cartItems.length > 0 ? 100 : 0;
    const total = (parseFloat(subtotal) + parseFloat(tax) + shippingCharge - offer_amount).toFixed(2)

    resolve({cartItems, subtotal, tax, offer_amount, offers, total, shippingCharge})

  })

}

exports.getProductsWithOffers = async (productId,user = null) => {
  const product = await Product.findById(productId).populate('category')
  const offers = await Offer.find({offer_status: 'active'})
  const offer = offers.find(offer => offer.applied_products.includes(product._id) || offer.applied_categories.includes(product.category))
  let discount = 0;
  let discount_type = null;

  if(offer){
    if(offer.offer_type === 'product'){
      if(offer.discount_type === 'fixed') {
        product.pricing.selling_price = product.pricing.original_price - offer.discount_value
        discount = offer.discount_value
      }else{
        discount = (offer.discount_value/100) * product.pricing.original_price
        product.pricing.selling_price = product.pricing.original_price - discount
      }
    }else{
      if(offer.discount_type === 'fixed') {
        product.pricing.selling_price = product.pricing.original_price - offer.discount_value
        discount = offer.discount_value
      }else{
        discount = (offer.discount_value/100) * product.pricing.original_price
        product.pricing.selling_price = product.pricing.original_price - discount
      }
    }
    discount = offer.discount_value
    discount_type = offer.discount_type
  }
  
  const rating = await this.getRatingMesures(product._id)
  /* const coupons = await Coupon.find({
		coupon_status:{$nin: ['disabled','expired']},
		applied_products:{$elemMatch:{$eq:productId}},
	}) */

  /* const updatedCoupons = user ? coupons.filter(coupon => !user.coupons.includes(coupon.coupon_code))
    .map(coupon => coupon.coupon_code) : [] */

  return {
    ...product.toObject(),
    discount,
    discount_type,
    rating,
    /* coupons: updatedCoupons */
  }
}

exports.getRatingMesures = async (productId) => {
  const reviews = await Review.find({ productId }).sort({createdAt: -1}).populate('user','username')
  const totalReviews = reviews.length;
  /* get seperate review percentages */
	const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	reviews.forEach((review) => {
		ratingCounts[review.rating]++;
	});
	const ratingPercent = {};
	for (let rating in ratingCounts) {
		ratingPercent[rating] = totalReviews
			? ((ratingCounts[rating] / totalReviews) * 100).toFixed(2)
			: 0;
	}

  /* get percentage out of five */
	const totalRating = reviews.reduce((acc, review) => acc + review.rating, 0);
	const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;
	const outOfFivePercent = ((averageRating / 5) * 100).toFixed(2);

  return {
    reviews,
    totalReviews,
    ratingPercent,
    ratingCounts,
    averageRating: averageRating.toFixed(1),
    outOfFivePercent
  }

}

exports.getDateRangeOfDay = (dayNumber, year, format) => {
  const startDate = moment().year(year).week(dayNumber).startOf('week')
  const endDate = moment().year(year).week(dayNumber).endOf('week')
  return {
    start: startDate.format(format),
    end: endDate.format(format)
  }
}

exports.getDateRangeOfWeek = (weekNumber, year, format) => {
  const startDate = moment().year(year).week(weekNumber).startOf('week')
  const endDate = moment().year(year).week(weekNumber).endOf('week')
  return {
    start: startDate.format(format),
    end: endDate.format(format)
  }
}

exports.getDateRangeOfMonth = (month, year, format) => {
  const startDate = moment().year(year).month(month).startOf('month')
  const endDate = moment().year(year).month(month).endOf('month')
  return {
    start: startDate.format(format),
    end: endDate.format(format)
  }
}

exports.checkDateOrTime = (input) => {
  
  if (moment(input, 'DD-MM-YYYY', true).isValid()) {
    return 'date';
  }
  
  if (moment(input, 'HH:mm:ss', true).isValid()) {
    return 'time';
  }

  return 'invalid';
}