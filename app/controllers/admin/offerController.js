const Offer = require('../../models/offerSchema');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const fn = require('../../helpers/functions');
const moment = require('moment');
const mongoose = require('mongoose');

exports.getOffers = async (req,res) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const offers = await Offer.find().skip(skip).limit(limit).sort({'createdAt':-1})
  const now = moment(new Date().toLocaleString(),"DD-MM-YYYY").utc().toDate();
  await Offer.updateMany({end_date: {$lt: now}},{offer_status:'expired'})
  
  //populate here to prevent cat-status error in layout > products.foreach
  const products = await Product.find({},{product_name:1}).sort({'createdAt':-1}).populate('category','category_status');
  const categories = await Category.find({},{category_name:1}).sort({'createdAt':-1});

  const count = await Offer.countDocuments();
  const totalPages = Math.ceil(count / limit);
  

  return res.render('admin/offers',{
    pageName: 'offers',
    offers,
    products,
    categories,
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    offer_info: req.session.offer_info,
    offer_values: req.session.offer_values,
    isAdmin:true
  });
}

exports.addOffer = async (req,res) => {

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
    req.session.offer_values = pValue;
  }else{
    req.session.offer_values = null
  }

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    pInfo.status = 400;
    req.session.offer_info = pInfo
    return res.send({success:false})
  }
  
  req.body.offer_code = req.body.offer_code.toUpperCase()
  req.body.start_date = moment(req.body.start_date,"DD-MM-YYYY").utc()
  req.body.end_date = moment(req.body.end_date,"DD-MM-YYYY").utc()

  const offer = new Offer(req.body)
  const {offer_type,applied_items} = req.body
  if(offer_type === 'product'){
    /* const ids = applied_items.map(id => new mongoose.Types.ObjectId(id))
    const products = await Product.aggregate([
      {$match:{_id:{$in:ids}}},
      {$project: {name: "$category_name"}}
    ]) */
    offer.applied_products = applied_items
  }else if(offer_type === 'category'){
    offer.applied_categories = applied_items
  }

  if(offer.discount_value > 10){
    pInfo.status = 400
    pInfo.discount_value = 'Discount can\'t exceed 10%'
    req.session.offer_info = pInfo
    return res.send({success:false})
  }

  const exist = await Offer.findOne({offer_code:offer.offer_code})
  if(exist) {
    req.session.offer_info = {status:400,offer_code:'This offer already exists'}
    return res.send({success:false})
  }

  await offer.save().then(() => {
    req.session.offer_info = fn.createToast(true,'success','Offer added successfully')
    res.redirect('/admin/offers')
  }).catch(err => {
    console.log(err)
    req.session.offer_info = fn.createToast(false,'error','Some error occurred, Try again.')
    res.redirect('/admin/offers')
  })

}

exports.updateOffer = async (req,res) => {

  const {offer_id} = req.params
  
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
    req.session.offer_values = pValue;
  }else{
    req.session.offer_values = null
  }

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    pInfo.status = 401;
    req.session.offer_info = pInfo
    return res.send({success:false})
  }
  
  req.body.offer_code = req.body.offer_code.toUpperCase()
  req.body.start_date = moment(req.body.start_date,"DD-MM-YYYY").utc()
  req.body.end_date = moment(req.body.end_date,"DD-MM-YYYY").utc()

  const {offer_type,applied_items,discount_value} = req.body

  if(offer_type === 'product'){
    req.body.applied_products = applied_items
  }else if(offer_type === 'category'){
    req.body.applied_categories = applied_items
  }

  if(discount_value > 10){
    pInfo.status = 401
    pInfo.discount_value = 'Discount can\'t exceed 10%'
    req.session.offer_info = pInfo
    return res.send({success:false})
  }

  const offer = await Offer.findById(offer_id)

  req.body.start_date = offer.start_date

  await Offer.findByIdAndUpdate(offer_id,{
    $set:req.body
  }).then(() => {
    req.session.offer_info = fn.createToast(true,'success','Offer updated successfully')
    res.send('Offer updated')
  }).catch(err => {
    console.log(err)
    req.session.offer_info = fn.createToast(false,'error','Some error occurred, Try again.')
    res.send('Update failed')
  })

}

exports.disableOffer = async (req,res) => {
  await Offer.findByIdAndUpdate(req.params.id,{
    $set:{offer_status: 'disabled'}
  }).then(() => {
    req.session.offer_info = fn.createToast(true,'success','Offer disabled successfully')
  }).catch(err => {
    console.log(err)
    req.session.offer_info = fn.createToast(false,'error','Some error occurred, Try again.')
  })
  res.send('Offer disabled')
}

exports.restoreOffer = async (req,res) => {
  await Offer.findByIdAndUpdate(req.params.id,{
    $set:{offer_status: 'active'}
  }).then(() => {
    req.session.offer_info = fn.createToast(true,'success','Offer enabled successfully')
  }).catch(err => {
    console.log(err)
    req.session.offer_info = fn.createToast(false,'error','Some error occurred, Try again.')
  })
  res.send('Offer restored')
}

exports.deleteOffer = async (req,res) => {
  //console.log(req.params)
  await Offer.findOneAndDelete({_id:req.params.id}).then(() => {
    req.session.offer_info = fn.createToast(true,'success','Offer deleted successfully')
  }).catch(err => {
    console.log(err)
    req.session.offer_info = fn.createToast(false,'error','Some error occurred, Try again.')
  })
  res.send('Offer deleted')
}

exports.getItmes = async (req, res) => {
  const {item} = req.params
  console.log(req.params)
  if(item === 'product'){
    const products = await Product.aggregate([
      {$project:{name:"$product_name"}},
      {$sort:{createdAt: -1}}
    ])
    return res.send(products)
  }else if(item === 'category'){
    const categories = await Category.aggregate([
      {$project:{name:"$category_name"}},
      {$sort:{createdAt: -1}}
    ])
    return res.send(categories)
  }
  return res.send({status:200})
}

exports.clearSession = (req, res) => {
  req.session.offer_info = null
  req.session.offer_values = null
  //res.send('Offer info cleared')
  return res.redirect('/admin/offers')
}
