const Coupon = require('../../models/couponSchema');
const Product = require('../../models/productModel');
const fn = require('../../helpers/functions');
const moment = require('moment');

exports.getCoupons = async (req,res) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const coupons = await Coupon.find().skip(skip).limit(limit).sort({'createdAt':-1})
  const now = moment(new Date().toLocaleString(),"DD-MM-YYYY").utc().toDate();
  await Coupon.updateMany({end_date: {$lt: now}},{coupon_status:'expired'})
  
  const products = await Product.find().sort({'createdAt':-1});

  const count = await Coupon.countDocuments();
  const totalPages = Math.ceil(count / limit);
  
  
  return res.render('admin/coupons',{
    pageName: 'coupons',
    coupons,
    products,
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    coupon_info: req.session.coupon_info,
    coupon_values: req.session.coupon_values,
    isAdmin:true
  });
}

exports.addCoupon = async (req,res) => {

  //console.log(req.body)
  let pInfo = {}, pValue = {};
  Object.entries(req.body)
    .filter(obj => !obj[1].length)
    .map(obj => {
      let key = obj[0].replaceAll('_'," ")
      pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      return pInfo
    })

  Object.entries(req.body)
    .filter(obj => obj[1].length)
    .map(obj => {
      pValue[obj[0]] = obj[1]
      return pValue
    });
    
  if(Object.keys(pValue).length){
    req.session.coupon_values = pValue;
  }else{
    req.session.coupon_values = null
  }

  let {discount_value,max_redeemable,min_cart_value} = req.body

  const discountValues = {discount_value,max_redeemable,min_cart_value}
  Object.entries(discountValues).filter(obj => parseFloat(obj[1]) <=0)
    .map(obj => {
      let key = obj[0].replaceAll('_'," ")
      pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot invalid`
      return pInfo
    })

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    pInfo.status = 400;
    req.session.coupon_info = pInfo
    return res.send({success:false})
  }
  
  /* const {coupon_code,discount_value,discount_type,start_date,end_date,min_cart_value,max_redeemable,description} =  */
  req.body.coupon_code = req.body.coupon_code.toUpperCase()
  req.body.start_date = moment(req.body.start_date,"DD-MM-YYYY").utc()
  req.body.end_date = moment(req.body.end_date,"DD-MM-YYYY").utc()

  discount_value = parseFloat(discount_value)
  max_redeemable = parseFloat(max_redeemable)

  if(max_redeemable > 100){
    req.session.coupon_info = {status:400,max_redeemable:'Max. redeemable can\'t exceed discount value'}
    return res.send({success:false})
  }

  const coupon = new Coupon(req.body)
  const exist = await Coupon.findOne({coupon_code:coupon.coupon_code})
  if(exist) {
    pInfo.status = 400
    pInfo.coupon_code = 'This coupon code already exists'
    req.session.coupon_info = pInfo
    return res.send({success:false})
  }

  if(discount_value > 5){
    pInfo.status = 400
    pInfo.discount_value = 'Discount can\'t exceed 5%'
    req.session.coupon_info = pInfo
    return res.send({success:false})
  }

  coupon.max_redeemable = discount_value * max_redeemable / 100
  coupon.discount_type = 'percentage'

  await coupon.save().then(() => {
    req.session.coupon_info = fn.createToast(true,'success','Coupon added successfully')
    res.redirect('/admin/coupons')
  }).catch(err => {
    console.log(err)
    req.session.coupon_info = fn.createToast(false,'error','Some error occurred, Try again.')
    res.redirect('/admin/coupons')
  })

}

exports.updateCoupon = async (req,res) => {

  const {coupon_id} = req.params
  
  let pInfo = {}, pValue = {};
  Object.entries(req.body)
    .filter(obj => !obj[1].length)
    .map(obj => {
      let key = obj[0].replaceAll('_'," ")
      pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      return pInfo
    })

  Object.entries(req.body)
    .filter(obj => obj[1].length)
    .map(obj => {
      pValue[obj[0]] = obj[1]
      return pValue
    });
    
  if(Object.keys(pValue).length){
    req.session.coupon_values = pValue;
  }else{
    req.session.coupon_values = null
  }

  let {discount_value,max_redeemable,min_cart_value} = req.body

  const discountValues = {discount_value,max_redeemable,min_cart_value}
  Object.entries(discountValues).filter(obj => parseFloat(obj[1]) <=0)
    .map(obj => {
      let key = obj[0].replaceAll('_'," ")
      pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot invalid`
      return pInfo
    })

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    pInfo.status = 401;
    req.session.coupon_info = pInfo
    return res.send({success:false})
  }
  
  /* const {coupon_code,discount_value,discount_type,start_date,end_date,min_cart_value,max_redeemable,description} =  */
  req.body.coupon_code = req.body.coupon_code.toUpperCase()
  req.body.start_date = moment(req.body.start_date,"DD-MM-YYYY").utc()
  req.body.end_date = moment(req.body.end_date,"DD-MM-YYYY").utc()

  discount_value = parseFloat(discount_value)
  max_redeemable = parseFloat(max_redeemable)

  if(max_redeemable > 100){
    req.session.coupon_info = {status:401,max_redeemable:'Max. redeemable can\'t exceed discount value'}
    return res.send({success:false})
  }

  const coupon = await Coupon.findById(coupon_id)

  if(discount_value > 5){
    pInfo.status = 401
    pInfo.discount_value = 'Discount can\'t exceed 5%'
    req.session.coupon_info = pInfo
    return res.send({success:false})
  }

  req.body.max_redeemable = max_redeemable > 10 ? discount_value * max_redeemable / 100 : max_redeemable
  req.body.start_date = coupon.start_date

  await Coupon.findByIdAndUpdate(coupon_id,{
    $set:req.body
  }).then(() => {
    req.session.coupon_info = fn.createToast(true,'success','Coupon updated successfully')
    res.send('Coupon updated')
  }).catch(err => {
    console.log(err)
    req.session.coupon_info = fn.createToast(false,'error','Some error occurred, Try again.')
    res.send('Update failed')
  })

}

exports.disableCoupon = async (req,res) => {
  await Coupon.findByIdAndUpdate(req.params.id,{
    $set:{coupon_status: 'disabled'}
  }).then(() => {
    req.session.coupon_info = fn.createToast(true,'success','Coupon disabled successfully')
  }).catch(err => {
    console.log(err)
    req.session.coupon_info = fn.createToast(false,'error','Some error occurred, Try again.')
  })
  res.send('Coupon disabled')
}

exports.restoreCoupon = async (req,res) => {
  await Coupon.findByIdAndUpdate(req.params.id,{
    $set:{coupon_status: 'active'}
  }).then(() => {
    req.session.coupon_info = fn.createToast(true,'success','Coupon enabled successfully')
  }).catch(err => {
    console.log(err)
    req.session.coupon_info = fn.createToast(false,'error','Some error occurred, Try again.')
  })
  res.send('Coupon restored')
}

exports.deleteCoupon = async (req,res) => {
  //console.log(req.params)
  await Coupon.findOneAndDelete({_id:req.params.id}).then(() => {
    req.session.coupon_info = fn.createToast(true,'success','Coupon deleted successfully')
  }).catch(err => {
    console.log(err)
    req.session.coupon_info = fn.createToast(false,'error','Some error occurred, Try again.')
  })
  res.send('Coupon deleted')
}

exports.clearSession = (req, res) => {
  req.session.coupon_info = null
  req.session.coupon_values = null
  res.send('Coupon info cleared')
}
