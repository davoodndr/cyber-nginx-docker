
const Product = require('../models/productModel');
const Offer = require('../models/offerSchema');
const Coupon = require('../models/couponSchema');
const User = require('../models/userModel')
const fn = require('../helpers/functions');
const Order = require('../models/orderSchema');
const Address = require('../models/addressModel');
const Transaction = require('../models/transactionModel');
const constants = require('../constants/constants')
require('dotenv').config()
const mongoose = require('mongoose');
const razorpay = require('razorpay');
const {validateWebhookSignature} = require('razorpay/dist/utils/razorpay-utils');
const { createInvoice } = require('../helpers/invoice')
const crypto = require('crypto');
const hbs = require('hbs')
const hbs_helpers = require('../helpers/hbs_helpers')
hbs.create({
  allowProtoPropertiesByDefault: true
});
hbs.registerHelper(hbs_helpers);

const instance = new razorpay({ 
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
  currency: 'INR'
})

exports.getWishlist = async (req, res) => {

  const wishlist = await User.findById(req.session.user._id).then(user => user.wishlist)
  const productsWithOffer = await Promise.all(wishlist.map(async item => {
    const newItem = {
      _id: item._id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      product: await fn.getProductsWithOffers(item.product)
    }
    return newItem
  }))

  res.render('user/wishlist',{
    isLogged: constants.isLogged,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: productsWithOffer,
    isAdmin: false
  })
}

exports.addOrRemoveWishlist = async (req, res) => {

  const {product} = req.body
  
  const user = await User.findOne({ _id: req.session.user._id });
  
  if (!user) {
    return res.send(fn.createToast(false, 'error', 'Please login to use wishlist.'));
  }

  const wishlist = user.wishlist || [];
  const productIndex = wishlist.findIndex(item => item.product.toString() === product);
  let removed = false
  if (productIndex !== -1) {
    wishlist.splice(productIndex, 1);
    removed = true;
  } else {
    wishlist.push({ product });
  }

  const popMessage = 'Product '+ (removed ? 'removed from' : 'added to') +' wishlist';

  user.wishlist = wishlist;

  await user.save().then(() => {
    res.send(fn.createToast(true, 'success', popMessage,null,{removed,count:wishlist.length}))
  }).catch(err => {
    console.log(err)
    res.send(fn.createToast(false, 'error', 'Some error occurred, Try again.'))
  })
  
}

exports.removeFromWishlist = async (req, res) => {

  const {item_id} = req.params
  const wishlist = await User.findById(req.session.user._id).populate('wishlist').then(user => user.wishlist)
  let deletedIndex = -1


  const filtered = wishlist.filter((item,index) => {
    if(item._id.toString() === item_id) deletedIndex = index
    return item._id.toString() !== item_id
  })

  await User.findOneAndUpdate({_id:req.session.user._id},{
    $set: {wishlist: filtered}
  }).then(async ()=>{
    return res.send({success:true, deletedIndex: deletedIndex, wishlist_count: filtered.length})
  }).catch(err => {
    console.log(err)
    return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
  })

}

exports.getCart = async (req, res) => {
  
  const {cartItems, subtotal, tax, offer_amount, total, shippingCharge} = await fn.getCartItmes(req.session.user._id);
  const allCoupons = cartItems.map(item => item.coupons).flat();
  const coupons = allCoupons.filter((value, index, self) => 
    index === self.findIndex((t) => (
      t.coupon_code === value.coupon_code
    ))
  );
  const sum = parseFloat(subtotal) + parseFloat(tax) + shippingCharge
  let couponToApply = req.session.couponsToApply;
  let coupon_amount = 0
  if(couponToApply && couponToApply.min_cart_value <= sum ){
    coupon_amount = couponToApply.max_redeemable / 100 * sum
  }else{
    req.session.couponsToApply = null
    couponToApply = null
  }
  const discounts = (parseFloat(offer_amount) + coupon_amount).toFixed(2)

  res.render('user/cart',{
    isLogged: constants.isLogged,
    cartItems,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: await fn.getWishlistItems(req.session.user._id),
    subtotal,
    tax,
    discounts,
    shippingCharge,
    total: total - discounts,
    coupons,
    couponToApply,
    order_info: req.session.order_info,
    isAdmin: false,
  })

}

exports.addToCart = async (req, res) => {
  
  const {product_id} = req.body;
  let {increase,decrease,quantity} = req.query;

  const product = await Product.findById(product_id).populate('category');
  
  if(product.product_status !== 'active' || product.category.category_status !== 'active') return res.send(fn.createToast(false, 'error', 'Sorry, this product not availble now'))
  
  let user = await User.findOne({_id:req.session.user._id}).populate('cart')
  let cart = user.cart
  
  if(cart){
    const existingItem = cart.find(el => el.item === product_id);
    // reassign quantity here for updating stock in product
    if (existingItem) {
      if(increase){
        existingItem.quantity += 1;
        quantity = -1;
      }else if(decrease && existingItem.quantity > 1) {
        existingItem.quantity -= 1;
        quantity = 1;
      }
      else if(quantity && quantity > 0){
        const tempQty = existingItem.quantity;
        existingItem.quantity = quantity;
        quantity = -(quantity - tempQty);
      }
    } else {
      cart.push({ item: product_id, quantity: 1 });
      quantity = -1;
    }
  }else{
    cart = [{
      item: product_id,
      quantity: 1
    }]
    quantity = -1;
  }

  user.cart = cart;

  const cartItems = await Promise.all(cart.map(async (cartItem) => {
    const product = await Product.findById(cartItem.item)
    const offers = await Offer.find(
      {
        offer_status:'active',
        $or:[
          {applied_products:{$in:[product._id]}},
          {applied_categories:{$in:[product.category._id]}}
        ],
      },
      {discount_type: 1, discount_value:1, offer_type: 1}
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
      _id: product._id,
      stock: product.stock,
      max_quantity: product.max_quantity,
      quantity: cartItem.quantity,
      item_tax: product.tax * cartItem.quantity,
      item_total: (product.pricing.original_price * cartItem.quantity),
      offer_value : (offer_value * cartItem.quantity),
      offer_count: offers.length
    };
  }));


  const outOfStock = cartItems.find(item => item._id.toString() === product_id && item.quantity > item.stock)

  const maxQuantityReached = cartItems.find(item => item._id.toString() === product_id && item.quantity > item.max_quantity)

  // quantity added here to detect if it is button click or input change
  if(outOfStock && !decrease){
    return res.send(fn.createToast(false, 'error', 'This product is out of stock',quantity))
  }

  if(maxQuantityReached){
    return res.send(fn.createToast(false, 'error', 'You already added max.quantity of this product in your cart.',quantity))
  }

  quantity = quantity || 0

  const subtotal = cartItems.reduce((acc, curr) => acc + curr.item_total, 0);
  const tax = cartItems.reduce((acc, curr) => acc + curr.item_tax, 0).toFixed(2);
  const offer_amount = cartItems.reduce((acc, curr) => acc + curr.offer_value, 0)
  const shippingFee = 100;
  const sum = parseFloat(subtotal) + parseFloat(tax) + shippingFee
  let coupon = req.session.couponsToApply;
  let coupon_amount = 0
  if(coupon && coupon.min_cart_value <= sum ){
    coupon_amount = coupon.max_redeemable / 100 * sum
  }else{
    if(decrease && coupon){
      coupon = fn.createToast(false,'info',"Coupon removed as cart value lowered than minimum")
    }else{
      coupon = null
    }
    req.session.couponsToApply = null
    req.session.couponsToApplyDiscount = null
  }
  
  const discounts = (offer_amount + coupon_amount).toFixed(2)

  req.session.couponsToApplyDiscount = coupon_amount
  req.session.currentTotal = (parseFloat(subtotal) + parseFloat(tax) + shippingFee - discounts)
  req.session.currentDiscount = (offer_amount + coupon_amount)

  // passed the cartItems here to reset the values of input fields
  await Product.findByIdAndUpdate({_id:product_id}, {$inc: {stock: quantity}}, {new: true}).then(async () => {
    await user.save().then(()=>{
      return res.send(fn.createToast(true,'success', 'Product added to cart successfully',null,{
        cart:cartItems,
        subtotal:subtotal.toFixed(2),
        tax,
        coupon,
        discounts,
        total: (parseFloat(subtotal) + parseFloat(tax) + shippingFee - discounts).toFixed(2),
        cart_count: cart.reduce((acc, curr) => acc + curr.quantity, 0)
      }))  
    }).catch(err => {
      console.log(err)
      return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
    })
  }).catch(err => {
    console.log(err)
    return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
  })

}

exports.removeFromCart = async (req, res) => {
  
  const {cart_id, product_id} = req.params
  let appliedCoupon = req.session.couponsToApply
  const {quantity} = req.query

  const cart = await User.findOne({_id:req.session.user._id})
                    .populate('cart')
                    .then(cart => cart.cart)

  let deletedIndex = -1
  const filtered = cart.filter((item,index) => {
    if(item._id.toString() === cart_id) deletedIndex = index
    return item._id.toString() !== cart_id
  })

  const cartCount = filtered.reduce((acc, curr) => acc + curr.quantity, 0);

  await User.findOneAndUpdate({_id:req.session.user._id},{$set: {cart: filtered}},{new:true})
  .then(async (user)=>{

    let {subtotal, offer_amount, total, tax, shippingCharge} = await fn.getCartItmes(req.session.user._id);
  
    // if all conditions meet the discount value apply on reload else discount reset to not applied state
    let discounts = offer_amount
    if(appliedCoupon){

      const sum = parseFloat(subtotal) + parseFloat(tax) + shippingCharge
      let coupon_amount = 0
      if(appliedCoupon.min_cart_value <= sum ){
        coupon_amount = appliedCoupon.max_redeemable / 100 * sum
      }else{
        appliedCoupon = fn.createToast(false,'info',"Coupon removed as cart value lowered than minimum")
        req.session.couponsToApply = null
        req.session.couponsToApplyDiscount = null
      }
      
      discounts = (parseFloat(offer_amount) + coupon_amount).toFixed(2)
    
    }

    await Product.findByIdAndUpdate({_id:product_id}, {$inc: {stock: quantity}}, {new: true}).then(async ()=>{

      const {cartItems} = await fn.getCartItmes(req.session.user._id)

      return res.send({
        success:true,
        deletedIndex: deletedIndex, 
        cart_count: cartCount,
        total,discounts,subtotal,tax,shippingCharge,
        cart:cartItems,
        coupon: appliedCoupon
      })
    }).catch(err => {
      console.log(err)
      return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
    })
  }).catch(err => {
    console.log(err)
    return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
  })

}

exports.getCheckout = async (req, res) => {

  let {cartItems, subtotal, tax, offer_amount, total, shippingCharge} = await fn.getCartItmes(req.session.user._id);

  const disabledProduct = cartItems.find(item => (item.product_status || item.category_status) !== 'active')
  if(disabledProduct){
    req.session.order_info = fn.sendResponse(400,'Error','error','Please remove invalid products')
    return res.redirect('/user/cart')
  }

  const shipping_address = req.session.shipping_address
  const billing_address = req.session.billing_address
  const couponDiscount = req.session.couponsToApplyDiscount
  let discounts = offer_amount
  if(couponDiscount){
    total = (total - couponDiscount).toFixed(2)
    discounts = (parseFloat(discounts) + couponDiscount).toFixed(2)
  }

  const appliedCoupons = req.session.couponsToApply ? req.session.couponsToApply.coupon_code : null

  res.render('user/checkout',{
    cartItems,
    appliedCoupons,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: await fn.getWishlistItems(req.session.user._id),
    user: await User.findById(req.session.user._id).populate('address_list'),
    isLogged: constants.isLogged,
    shipping_address,
    billing_address,
    subtotal,
    tax,
    shippingCharge,
    total,
    discounts,
    acc_info: req.session.acc_info,
    acc_values: req.session.acc_values,
    states: constants.STATES_INDIA,
    isAdmin: false,
  }) 
}

exports.applyCoupon = async (req, res) => {

  // reset existing coupon
  req.session.couponsToApply = null
  req.session.couponsToApplyDiscount = null

  const {coupon_code} = req.body;
  if(coupon_code && coupon_code.length){
    const reqCoupon = coupon_code.toUpperCase()
    const user = req.session.user;
    const alreadyUsed = user.coupons.filter(coupon => coupon.coupon_code === reqCoupon)
    if(alreadyUsed.length > 0){
      return res.send(fn.createToast(false, 'error', 'You have already used this coupon'))
    }
    const coupon = await Coupon.findOne({coupon_code: reqCoupon})
    if(!coupon){
      return res.send(fn.createToast(false, 'error', 'Invalid coupon entered'))
    }
    const {cartItems, subtotal, offer_amount, total} = await fn.getCartItmes(req.session.user._id);

    const couponNotEligible = total < coupon.min_cart_value;
    if(couponNotEligible){
      return res.send(fn.createToast(false, 'error', 'This coupon not eligible for this cart amount'))
    }

    const isCouponProductIncluded = cartItems.filter(item => item.coupons.filter(coupon => reqCoupon === coupon.coupon_code).length > 0)

    if(isCouponProductIncluded.length === 0){
      return res.send(fn.createToast(false, 'error', 'This coupon can\'t apply here'))
    }
    
    const disc = coupon.max_redeemable / 100 * total

    req.session.couponsToApply = coupon
    req.session.couponsToApplyDiscount = disc
    req.session.currentTotal = (parseFloat(total) - disc)
    req.session.currentDiscount = (parseFloat(offer_amount) + disc)
    return res.send({success:true, discount: (parseFloat(offer_amount) + disc).toFixed(2), total: (parseFloat(total) - disc).toFixed(2)})
  }
}

exports.removeCoupon = (req, res) => {

  const appliedCoupon = req.session.couponsToApply
  if(appliedCoupon){
    const currentTotal = req.session.currentTotal
    const couponAmount = req.session.couponsToApplyDiscount
    const currentDiscount = req.session.currentDiscount
    req.session.couponsToApply = null
    req.session.currentTotal = null
    req.session.couponsToApplyDiscount = null
    req.session.currentDiscount = null
    return res.send({
      success:true, 
      total: (parseFloat(currentTotal) + parseFloat(couponAmount)).toFixed(2),
      discount: (parseFloat(currentDiscount) - parseFloat(couponAmount)).toFixed(2)
    })
  }
}

exports.placeOrder = async (req, res) => {

  const {billing_address, shipping_address, payment_method} = req.body;

  const user = await User.findById(req.session.user._id);

  if(!billing_address || !shipping_address) {
    return res.send(fn.createToast(false,'error', 'Please provide billing and shipping Addresses'))
  }

  let bill_address = await Address.findOne({_id:billing_address});
  let ship_address = await Address.findOne({_id:shipping_address});

  let orderData = req.body;
  orderData.user_id = req.session.user._id;
  orderData.order_no = '#'+fn.generateUniqueId();
  orderData.billing_address = {
    ...bill_address,
    address_type: 'billing',
  } 
  orderData.shipping_address = {
    ...ship_address,
    address_type:'shipping',
  };

  let {cartItems, subtotal, offer_amount, offers, tax, total, shippingCharge} = await fn.getCartItmes(req.session.user._id)

  const couponToApply = req.session.couponsToApply
  const couponDiscount = req.session.couponsToApplyDiscount
  if(couponToApply){

    // this line replace the coupons in cartItem which was applied to get available coupons
    // here replace it with only user applied coupons
    cartItems = cartItems.map(item => {
      const couponsToReplace = item.coupons.find(coupon => couponToApply.coupon_code === coupon.coupon_code)
      if(couponsToReplace){
        item.coupons = couponsToReplace
        item.coupon_amount = couponDiscount
      }
      return item
    })

  }else{
    cartItems = cartItems.map(item => {
      item.coupons = [];
      return item
    })
  }
  
  orderData.offer_amount = offer_amount
  orderData.coupon_amount = couponDiscount

  let discounts = offer_amount;
  if(couponDiscount){
    // offer amount already deducted inside getCartItems
    total = total - couponDiscount
    discounts = parseFloat(discounts) + couponDiscount
  }
  
  orderData.cart = cartItems;
  orderData.order_subtotal = subtotal;
  orderData.coupon = couponToApply;
  orderData.discounts = discounts;
  orderData.offers = offers;
  orderData.order_total = total;
  orderData.tax = tax;
  orderData.shipping_charge = shippingCharge;
  const order = new Order(orderData);


  let result, transactions = {};
  if(payment_method === 'razorpay') {
    await instance.orders.create(
      {
        amount: parseInt(orderData.order_total * 100),
        currency: 'INR',
        receipt: orderData.order_no,
      }
    ).then((res) => {
      result = res;
      result.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    }).catch(err => {
      console.log('razorpay',err)
    })
    
  }else if(payment_method === 'wallet') {
    order.payment_status = 'paid';
    order.paid_amount = order.order_total;
    transactions = new Transaction({
      user_id: req.session.user._id,
      transaction_id: '#'+fn.generateUniqueId(),
      payment_method: 'wallet',
      transaction_type: 'withdraw',
      transaction_amount: order.order_total,
      current_balance: parseFloat(user.wallet) - parseFloat(order.order_total),
      description: `Payment made on order no: ${order.order_no}`,
    })
    
  }else if(payment_method === 'cod' && order.order_total > 1000){
    return res.send(fn.createToast(false,'error', 'Order above ₹1000 can\'t do with COD'))
  }

  if(payment_method === 'razorpay' && (!result || result.error)) {
    return res.send(fn.createToast(false,'error', 'Payment Failed. Please retry.'))
  }

  const walletTotal = transactions.transaction_amount || 0;

  if(user.wallet < walletTotal) {
    return res.send(fn.createToast(false,'error', 'Insufficient wallet balance'))
  }

  const updatedCoupons = []

  if(couponToApply){
    updatedCoupons.push(couponToApply.coupon_code)
  }
  if(user.coupons.length){
    updatedCoupons.push(...user.coupons.map(coupon => coupon))
  }

  result  = result ? result : {order_id: order._id};
  result.name = order.billing_address.fullname


  const orderDatas = {order,walletTotal,updatedCoupons,transactions,cartItems}

  req.session.orderData = orderDatas;

  return res.send(result)
}

exports.verifyPayment = async (req, res) => {

  const {handler, razorpay_payment_id, razorpay_order_id, razorpay_signature, error, order_id, amount} = req.body;
  const user = req.session.user;
  const {order,walletTotal,updatedCoupons,transactions,cartItems} = req.session.orderData
  const failedOrder = order_id ? await Order.findById(order_id) : null
  let confirmSuccess = false


  if(handler !== 'cod-success'){
    if(handler === 'razorpay-success'){

      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const isValidSignature = validateWebhookSignature(body, razorpay_signature, process.env.RAZORPAY_KEY_SECRET);

      if(isValidSignature) {
        order.payment_status = 'paid'
        order.paid_amount = parseFloat(order.paid_amount) + parseFloat(amount/100)
        order.payment_id = razorpay_payment_id
        order.razorpay_order_id = razorpay_order_id
      }else{
        return res.send(fn.createToast(false, 'error', 'Invalid Signature'))
      }

      if(failedOrder) {
        failedOrder.payment_status = 'paid'
        failedOrder.paid_amount = parseFloat(failedOrder.paid_amount) + parseFloat(amount/100)
        failedOrder.payment_id = razorpay_payment_id
        failedOrder.razorpay_order_id = razorpay_order_id
        failedOrder.order_status = 'pending'
      }

    }else if(handler === 'razorpay-failure'){
      order.payment_status = 'failed'
      order.payment_id = error.metadata.payment_id
      order.razorpay_order_id = error.metadata.order_id
      order.order_status = 'payment pending'
    }
  }

  const finalOrder = failedOrder ? failedOrder : new Order(order);

  if(failedOrder){
    await finalOrder.save().then(() => {
      req.session.orderData = null
      if(handler === 'razorpay-failure'){
        return res.send(fn.sendResponse(false,'Retry Payment','error', 'Please retry payment to complete your order',null,{order_id:finalOrder._id}))
      }
      return res.send(fn.sendResponse(true,'Order Placed!','success', 'Your order has been placed successfully.',null,{order_id:finalOrder._id}))
    })
  }else{

    await Promise.all([

      await User.findByIdAndUpdate(
        {_id:req.session.user._id},
        {
          $set: {
            cart: [],
            wallet: parseFloat(user.wallet) - walletTotal,
            coupons: updatedCoupons ? updatedCoupons : []
          },
        },
        {new: true }
      ),
  
      Object.keys(transactions).length > 0 ? await  new Transaction(transactions).save() : Promise.resolve(),
  
      cartItems.forEach(async (item) => {
        const max_quantity = Math.max(1,Math.min(Math.floor(item.stock / 3),10));
        await Product.findOneAndUpdate({_id:item.product_id},{
          $set: {max_quantity},
        })
      }),

      await finalOrder.save(),
  
    ]).then(response => {
      req.session.orderData = null
      req.session.couponsToApply = null
      req.session.couponsToApplyDiscount = null
      if(handler === 'razorpay-failure'){
        return res.send(fn.sendResponse(false,'Retry Payment','error', 'Please retry payment to complete your order',null,{order_id:finalOrder._id}))
      }
      return res.send(fn.sendResponse(true,'Order Placed!','success', 'Your order has been placed successfully.',null,{order_id:finalOrder._id}))
    })
    .catch(err => {
      console.log(err)
      res.send(fn.createToast(false, 'error', 'Internal Server Error'))
    })
  }

}

exports.viewOrder = async (req, res) => {

  const user_id = req.session.user._id;
  
  const totalOrders = await Order.countDocuments({user_id});
  
  const order_data = await Order.findById(req.query.id)
            .populate('user_id')
            .populate('billing_address')
            .populate('shipping_address')
            .populate('coupon','coupon_code')
            .populate('cart.offers','offer_code')

  
  const orderItems = await Promise.all(order_data.cart.map(async (item) => {
    const product = await Product.findById(item.product_id);
    return {
      product_name: product.product_name,
      thumb: product.images[0],
      quantity: item.quantity,
      price: item.price.toFixed(2),
      item_tax: item.item_tax.toFixed(2),
      item_total: item.item_total.toFixed(2),
      coupons: item.coupons,
      offers: item.offers,
      item_status: item.item_status
    };
  }));

  const order = {
    _id: order_data._id,
    order_no: order_data.order_no,
    order_subtotal: order_data.order_subtotal.toFixed(2),
    tax: order_data.tax.toFixed(2),
    discounts: order_data.discounts.toFixed(2),
    shipping_charge: order_data.shipping_charge,
    order_total: order_data.order_total.toFixed(2),
    order_status: order_data.order_status,
    payment_status: order_data.payment_status,
    payment_id: order_data.payment_id,
    razorpay_order_id: order_data.razorpay_order_id,
    createdAt: order_data.createdAt,
    shipping_address: order_data.shipping_address,
    billing_address: order_data.billing_address,
    coupon: order_data.coupon,
    offers: order_data.offers,
    cart: orderItems,
    totalOrders,
  };

  const cancelledItems = order_data.cart.filter(item => item.item_status === 'cancelled')
  const cancelledItemsCount = cancelledItems.reduce((acc, curr) => acc + curr.quantity, 0)
  const cancelledSubtotal = cancelledItems.reduce((acc, curr) => acc + curr.price, 0)
  const cancelledTax = cancelledItems.reduce((acc, curr) => acc + curr.item_tax, 0)
  const cancelledDiscounts = cancelledItems.reduce((acc, curr) => acc + (curr.offer_amount + curr.coupon_amount), 0)
  const cancelledRefunded = cancelledItems.reduce((acc, curr) => acc + curr.isRefunded ? curr.refund_amount : 0, 0)
  const cancelledNotRefunded = cancelledItems.reduce((acc, curr) => acc + !curr.isRefunded ? curr.refund_amount : 0, 0)

  let cancelledSummery = {
    orderItemsCount: order.cart.reduce((acc, curr) => acc + curr.quantity, 0) - cancelledItemsCount,
    order_subtotal: (order_data.order_subtotal - cancelledSubtotal).toFixed(2),
    tax: (order_data.tax - cancelledTax).toFixed(2),
    discounts: (order_data.discounts - cancelledDiscounts).toFixed(2),
    shipping_charge: order_data.shipping_charge,
    cancelledRefunded: cancelledRefunded.toFixed(2),
    cancelledNotRefunded: cancelledNotRefunded.toFixed(2),
    order_total: (order_data.order_total - (cancelledRefunded + cancelledNotRefunded)).toFixed(2),
  }

  cancelledSummery = cancelledItems.length > 0 && orderItems.length - cancelledItems.length > 0 ? cancelledSummery : null

  return res.render('user/view_order', {
    orderItemsCount: order.cart.reduce((acc, curr) => acc + curr.quantity, 0),
    order,
    isLogged: constants.isLogged,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: await fn.getWishlistItems(req.session.user._id),
    cancelledSummery,
    isAdmin: false,
  })
}

exports.cancelItem = async (req, res) => {

  const {order_id, item_id} = req.params;

  let item = await Order.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(order_id)}},
    { $project: {order_total:1,cart:1,coupon:1,coupon_amount:1,offer_amount:1}},
    { $lookup: { 
        from: 'coupons',
        localField: 'coupon',
        foreignField: '_id',
        as: 'coupon'
      }

    },
    { $unwind: '$cart' },
    { $match: {'cart._id': new mongoose.Types.ObjectId(item_id)}},
    { $lookup: 
      {
        from: 'products',
        localField: 'cart.product_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $set: { 
      'cart.product_name': { $arrayElemAt: ["$product.product_name", 0] },
      } 
    },

    { $project: {
        _id: "$cart", order_total:"$order_total",
        coupon_amount: '$coupon_amount', coupon: { $arrayElemAt: ["$coupon", 0] }
      } 
    },
    
  ])

  
  const itemToCancel = item[0]._id
  const coupon = item[0].coupon

  const order = await Order.findOne({ _id: order_id, 'cart._id': item_id });

  const currentDate = new Date();
  const orderDate = new Date(order.createdAt);
  const diffInMilliseconds = currentDate - orderDate;
  const diffInDays = diffInMilliseconds / (1000 * 3600 * 24);
  if (diffInDays > 7) {
    return res.send(fn.createToast(false,'error', 'Order can cancel only within 7 days')) 
  }
  
  if(order.order_status !== 'pending' && order.order_status !== 'payment pending'){
    return res.send(fn.createToast(false,'error', 'Confirmed order cannot cancel'))
  }

  let reducedAmount = order.order_total - (itemToCancel.item_total + itemToCancel.item_tax)
  let reducedDiscount = item[0].coupon_amount
  let returnAmount = itemToCancel.item_total + itemToCancel.item_tax - itemToCancel.offer_amount


  if(item[0].coupon_amount > 0){

    if(order.cart.length > 1){
      const couponAmount = coupon.max_redeemable / 100 * (itemToCancel.item_total + itemToCancel.item_tax)
      
      returnAmount -= couponAmount
    }else{
      returnAmount = returnAmount - itemToCancel.coupon_amount
    }
  
  }

  const allCancelledOrder = order.cart.findIndex(item => item._id.toString() !== item_id && item.item_status !== 'cancelled')
  if(allCancelledOrder === -1) {
    order.order_status = 'cancelled'
    returnAmount += order.shipping_charge
  }

  const user = await User.findOne({_id:req.session.user._id});
  // creating transactions for cancelled items
  const transaction = new Transaction({
    user_id: req.session.user._id,
    transaction_id: '#'+fn.generateUniqueId(),
    payment_method: 'wallet',
    transaction_type: 'deposit',
    transaction_amount:returnAmount,
    current_balance: parseFloat(user.wallet) + parseFloat(returnAmount),
    description: `Refund on cancellation - ${itemToCancel.product_name}`,
  })

  
  order.cart.map(item => {
    if(item._id.toString() === item_id){
      item.item_status = 'cancelled';
      if(order.payment_status === 'paid') item.isRefunded = true;
      item.refund_amount = returnAmount
    }
  })

  if(order.payment_status === 'paid'){

    await Promise.all([

      await User.findByIdAndUpdate({ _id: req.session.user._id },{$set:{wallet: transaction.current_balance}}),
      await Product.findOneAndUpdate({_id:itemToCancel.product_id}, {$inc: {stock: itemToCancel.quantity}}),
      await transaction.save(),
      await order.save(),
  
    ]).then((result) => {
      
      return res.send(fn.createToast(true,'success', 'Item cancelled successfully'))
    }).catch(err => {
      console.log(err)
    })
  }else{
    await Promise.all([

      await Product.findOneAndUpdate({_id:itemToCancel.product_id}, {$inc: {stock: itemToCancel.quantity}}),
      await order.save(),
  
    ]).then((result) => {
      
      return res.send(fn.createToast(true,'success', 'Item cancelled successfully'))
    }).catch(err => {
      console.log(err)
    })
  }
}

exports.downloadInvoice = async (req,res) => {

  const totalOrders = await Order.countDocuments({user_id:req.session.user._id});
  const order_data = await Order.findById(req.query.order)
            .populate('user_id')
            .populate('billing_address')
            .populate('shipping_address')
            .populate('cart.coupons','coupon_code')
            .populate('offers','offer_code')

  
  const orderItems = await Promise.all(order_data.cart.filter(item => item.item_status !== 'cancelled')
  .map(async (item) => {
    const product = await Product.findById(item.product_id);
    return {
      product_name: product.product_name,
      thumb: product.images[0],
      quantity: item.quantity,
      price: item.price,
      item_tax: item.item_tax,
      item_total: item.item_total,
      coupon_amount: item.coupon_amount,
      offer_amount: item.offer_amount
    };
  }));

  const refundAmount = order_data.cart.reduce((acc,cur) => acc+cur.refund_amount,0)

  const order = {
      order_subtotal: orderItems.reduce((acc,cur) => acc+ cur.item_total,0),
      tax: orderItems.reduce((acc,cur) => acc+ cur.item_tax,0),
      discounts: orderItems.reduce((acc,cur) => acc+ (cur.coupon_amount + cur.offer_amount),0),
      order_no: order_data.order_no,
      order_total: order_data.order_total - refundAmount,
      shipping_address: order_data.shipping_address,
      cart: orderItems,
      totalOrders,
  };
  
  const pdfData = await createInvoice(order);
  res.setHeader('Content-Disposition', 'inline; filename=sales_report.pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.end(pdfData);
}

exports.retryPayment = async (req,res) => {

  const {order_id} = req.body;
  let result = {};

  const order = await Order.findById(order_id)
  const cancelledAmount = order.cart.reduce((acc,cur) => acc + cur.refund_amount,0)

  if(cancelledAmount > 0){
    await instance.orders.create(
      {
        amount: parseInt((order.order_total - cancelledAmount) * 100),
        currency: 'INR',
        receipt: order.order_no,
      }
    ).then((res) => {
      result = res;
      result.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
      result.name = order.billing_address.fullname
      result.failed_order_id = order_id
    }).catch(err => {
      console.log('razorpay',err)
    })
  }else{
    result.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    result.amount = parseInt(order.order_total * 100)
    result.currency = 'INR'
    result.id = order.razorpay_order_id
    result.failed_order_id = order_id
    result.name = order.billing_address.fullname
  }

  const user = req.session.user;

  const orderDatas = {order,walletTotal:user.wallet,updatedCoupons:user.coupons,transactions:[],cartItems:[]}

  req.session.orderData = orderDatas;

  return res.send(result)
}

exports.clearOrderSession = (req,res) => {
  req.session.order_info = null;
  return res.send({succes:true})
}