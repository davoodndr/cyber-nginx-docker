const Order = require('../../models/orderSchema');
const Product = require('../../models/productModel')
const Transaction = require('../../models/transactionModel')
const User = require('../../models/userModel')
const fn = require('../../helpers/functions')
const { createInvoice } = require('../../helpers/invoice')

exports.getOrders = async (req, res) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  let orders = await Order.find()
                    .populate('billing_address')
                    .skip(skip).limit(limit)
                    .sort({'createdAt':-1})
  orders = orders.map(order => {
    const cancelledItems = order.cart.filter(item => item.item_status === 'cancelled')
    const cancelledRefund = cancelledItems.reduce((acc, curr) => acc + curr.refund_amount, 0)
    if(order.order_status !== 'cancelled'){
      order.order_total = (order.order_total - cancelledRefund).toFixed(2)
    }else{
      order.order_total = order.order_total.toFixed(2)
    }
    return order
  })


  const count = await Order.countDocuments();
  const totalPages = Math.ceil(count / limit);
  return res.render('admin/orders',{
    pageName: 'orders',
    orders,
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    order_info: req.session.order_info,
    isAdmin:true
  })
}

exports.changeOrderStatus = async (req,res) => {
  const {order_id, new_status} = req.params
  
  await Order.findByIdAndUpdate(order_id,{$set:{order_status:new_status}},{new:true}).then(order => {
    req.session.order_info = fn.sendResponse(201,"success",'success','Operation success!')
    res.redirect('/admin/orders')
  }).catch(err => {
    console.log(err)
    req.session.order_info = fn.sendResponse(500,"error",'error','Operation Failed!')
    res.redirect('/admin/orders')
  })

}

exports.cancelOrder = async (req, res) => {
  const {order_id} = req.params

  const order = await Order.findById(order_id).populate('cart.product_id')
  const user = await User.findById(order.user_id)

  const cancelledItems = order.cart.filter(item => item.item_status === 'cancelled')
  const itemsToCancel = order.cart.filter(item => item.item_status !== 'cancelled')
  const cancelledRefund = cancelledItems.reduce((acc, curr) => acc + curr.refund_amount, 0)
  const transaction_amount = parseFloat(order.paid_amount) - parseFloat(cancelledRefund)

  let transaction = null
  if(order.payment_status === 'paid'){
    transaction = new Transaction({
      user_id: order.user_id,
      transaction_id: '#'+fn.generateUniqueId(),
      payment_method: 'wallet',
      transaction_type: 'deposit',
      transaction_amount,
      current_balance: parseFloat(user.wallet) + parseFloat(transaction_amount),
      description: `Refund on cancellation - ${order.order_no}`,
    })
    order.refund_amount = order.transaction_amount
    order.isRefunded = true
  }
  order.order_status = 'cancelled'

  //console.log(transaction,order.order_status,transaction_amount)

  await Promise.all([

    await order.save(),

    order.payment_status === 'paid' ? await transaction.save() : Promise.resolve(),

    order.payment_status === 'paid' ? await User.findByIdAndUpdate(order.user_id,{$set:{wallet: transaction.current_balance}})
    : Promise.resolve(),

    itemsToCancel.forEach(async item => {
      await Product.findOneAndUpdate({_id:item.product_id._id}, {$inc: {stock: item.quantity}})
    })

  ]).then(() => {
    
    req.session.order_info = fn.sendResponse(201,"success",'success','Order cancelled successfully!')
    res.redirect('/admin/orders')
  }).catch(err => {
    console.log(err)
    req.session.order_info = fn.sendResponse(500,"error",'error','Order cancellation failed!')
    res.redirect('/admin/orders')
  })
}

exports.viewOrder =  async (req, res) => {
  
  const order_data = await Order.findById(req.query.id)
            .populate('user_id')
            .populate('billing_address')
            .populate('shipping_address')
            .populate('coupon','coupon_code')
            .populate('cart.offers','offer_code')

  //console.log(order_data)
  const totalOrders = await Order.countDocuments({user_id:order_data.user_id});
  
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

  return res.render('admin/view_order', {
    orderItemsCount: order.cart.reduce((acc, curr) => acc + curr.quantity, 0),
    order,
    cancelledSummery,
    isAdmin: true,
  })
}

exports.downloadInvoice = async (req,res) => {

  
  const order_data = await Order.findById(req.query.order)
            .populate('user_id')
            .populate('billing_address')
            .populate('shipping_address')
            .populate('cart.coupons','coupon_code')
            .populate('offers','offer_code')

  const totalOrders = await Order.countDocuments({user_id:order_data.user_id});
  
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

exports.clearSession = (req, res) => {
  const {status} = req.params
  const {redirect, destroy} = req.query
  if(status == 201){
    req.session.order_info = null
    return res.redirect(`/${redirect}`)
  }else{
    //console.log(destroy)
    if(destroy) req.session.signup_info = null
    if(redirect) return res.redirect(`/${redirect}`)
  }
}