require('dotenv').config()
const Product = require('../models/productModel');
const Category = require('../models/categoryModel');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/userModel')
const Address = require('../models/addressModel')
const constants = require('../constants/constants')
const Order = require('../models/orderSchema');
const Coupon = require('../models/couponSchema')
const Offer = require('../models/offerSchema')
const Transaction = require('../models/transactionModel')
const fn = require('../helpers/functions');
const moment = require('moment');

exports.getHome = async (req, res) => {

  //req.session.user = await User.findById('6711c46d731d478ccdad43f6'/* '6712192a397dcef4eb7ea766' */);
  const user = req.session.user;
  constants.isLogged = user ? true : false;

  /* Setup coupon validity */
  const now = moment(new Date().toLocaleString(),"DD-MM-YYYY").utc().toDate();
  await Coupon.updateMany({end_date: {$lt: now}},{coupon_status:'expired'})
  await Offer.updateMany({end_date: {$lt: now}},{offer_status:'expired'})

  const products = await Product.find().limit(10).sort({createdAt: -1})
  const produtsWithOffer = await Promise.all(products.map(async product => {
    return await fn.getProductsWithOffers(product._id,user)
  }))
  const productIds = products.map(item => item._id.toString())
  //reset maxquantity for cart
  products.map(async product => {
    /* const existingCartItem = user.cart.find(item => item.item === product._id.toString())
    if(existingCartItem){
      const existingQuantity = existingCartItem.quantity */
      await Product.findOneAndUpdate({_id:product._id},{
        $set: {max_quantity: Math.max(1,Math.min(Math.floor(product.stock / 3),10))/*  + existingQuantity - 1 */}
      })
    //}
  })

  await Product.updateMany({},{
    $set: {'pricing.selling_price':0}
  })

  res.render('user/home',{
    products: produtsWithOffer,
    productIds,
    isLogged: constants.isLogged,
    categories: await Category.find({category_status:'active'}),
    cartItemsCount: user ? await fn.getCartItemsCount(req.session.user._id) : 0,
    wishlist: user ? await fn.getWishlistItems(req.session.user._id) : [],
    isAdmin:false
  })
}

exports.getSignup = (req, res) => {
  res.render('user/signup',{
    signup_info: req.session.signup_info,
    signup_values: req.session.signup_values,
    cartItemsCount: 0,
    wishlist: [],
    isAdmin:false
  })
}

exports.doSignup = async (req, res) => {
  
  let pInfo = {}, pValue = {};
  req.body.terms = req.body.terms ?? ''
  Object.entries(req.body)
    .filter(obj => !obj[1].length)
    .map(obj => {
      let key = obj[0].replace('_'," ");
      pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      return pInfo
    })

  Object.entries(req.body)
    .filter(obj => obj[1].length)
    .map(obj => {
      
      if(obj[0] === 'username' && obj[1].length < 2){
        pInfo.username = 'Requires atleast 2 letters'
      }else if(obj[0] === 'email' && !fn.validateEmail(obj[1])){
        pInfo.email = 'Email should be valid'
      }else if(obj[0] === 'password'){
        const pass = fn.validatePassword(obj[1]);
        if(typeof pass === 'string'){
          pInfo.password = pass
        }else if(typeof pass === 'boolean' && pass === false){
          pInfo.password = 'Password not correct'
        }
      }
      
      pValue[obj[0]] = obj[1]
      return pValue
    })
    
  if(Object.keys(pValue).length){
    req.session.signup_values = pValue;
  }else{
    req.session.signup_values = null
  }

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    req.session.signup_info = pInfo
    return res.redirect('/signup')
  }

  let {username, email, password} = req.body

  let user = await User.findOne({email})

  if(user){
    req.session.signup_info = fn.sendResponse(400,'Duplicate!','error','This user already exists!');
    return res.redirect('/signup')
  }
  
  const otp = generateOTP()
  const otpExpiration = Date.now() + 1 * 60 * 1000; // 1 minute

  await sendOTPEmail(username, email, otp).then(() => {
    console.log('mail send', `${otp}`)
    req.session.user_data = {name: username, email: email, pass: password, otp: otp, exprire: otpExpiration}
    req.session.start = true // for disabling reset timer on page reload
    return res.redirect('/get-verify-otp')
  }).catch(err => {
    console.log(err)
  });

}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  port: 587, //default port for gmail
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.MAILER_EMAIL,
    pass: process.env.MAILER_PASS,
  },
});

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
};

// Send OTP Email
const sendOTPEmail = async (name, email, otp) => {
  const mailOptions = {
      from: process.env.MAILER_EMAIL,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP code is ${otp}. It is valid for only 1 minute.`,
      html: mailTemplate(name,otp)
  };

  await transporter.sendMail(mailOptions)
  .then(res => res.accepted.length > 0)
  .catch(err => err);
};

exports.getVerify = (req, res) => {
  return res.render('user/signup_otp',{
    start: req.session.start
  })
}

exports.removeTimer = (req,res) => {
  req.session.start = false;
  return res.send({success:true})
}

exports.verifyOTP = async (req, res) => {
  
  const {otp} = req.body;
  const {user_data} = req.session

  if (user_data && user_data.otp !== otp) {
    return res.send(fn.sendResponse(400,'Error!','error','Invalid OTP. Please Try again',null,{url:"/signup"}))
  }

  if (user_data && user_data.otpExpiration < Date.now()) {
    return res.send(fn.sendResponse(400,'Error!','error','OTP expired. Please retry',null,{url:"/signup"}))
  }
  
  const hashedPass = await bcrypt.hash(user_data.pass,10)

  const newUser = await new User({
    username: user_data.name,
    email: user_data.email,
    password: hashedPass,
    user_status: 'active'
  });

  await newUser.save()
  .then(() => {
    const info = fn.sendResponse(201,'Success!','success','Account created Successfully!',null,{url:"/login"})
    return res.send(info)
  })
  .catch((error) =>{
    // Handle other errors
    console.log(error)
    req.session.signup_info = fn.sendResponse(500,'Error!','error','Server error.');
    return res.redirect('/signup')
  })
};

exports.resendOTP = async (req,res) => {
  const {name, email, pass} = req.session.user_data;
  if(!email) {
    return res.send(fn.sendResponse(400,'Error!','error','Email destroyed, Please resubmit'))
  }

  const otp = generateOTP()
  const otpExpiration = Date.now() + 1 * 60 * 1000; // 1 minute
  await sendOTPEmail(name, email, otp).then(() => {
    console.log('mail send', `${otp}`)
    req.session.user_data = {name: name, email: email, pass: pass, otp: otp, exprire: otpExpiration}
    return res.send(fn.sendResponse(200,'Success!','success','OTP resent Successfully'))
  }).catch(err => {
    console.log(err)
    return res.send(fn.sendResponse(500,'Error!','error','Internal Server Error'))
  });

}

exports.getForgotPassword = (req, res) => {
  res.render('user/forgot_password')
}

exports.sendForgotOtp = async (req,res) => {
  const {email} = req.body;

  if(!email) {
    return res.send(fn.sendResponse(400,'Error!','error','Please enter an email to send code.'))
  }

  const user = await User.findOne({email: email})

  if(!user){
    return res.send(fn.sendResponse(400,'Error!','error','User not found'))
  }

  const name = user.username

  const otp = generateOTP()
  const otpExpiration = Date.now() + 1 * 80 * 1000;

  await sendOTPEmail(name, email, otp).then(() => {
    console.log('mail send', `${otp}`)
    req.session.user_data = {email: email, otp: otp, exprire: otpExpiration}
    return res.send(fn.sendResponse(200,'Success!','success','OTP sent Successfully'))
  }).catch(err => {
    console.log(err)
    return res.send(fn.sendResponse(500,'Error!','error','Internal Server Error'))
  });
}

exports.verifyForgotOTP = (req, res) => {
  const {otp} = req.query;
  const {user_data} = req.session

  if (user_data.otp !== otp) {
    return res.send(fn.sendResponse(400,'Error!','error','Invalid OTP. Please Try again'))
  }

  if (user_data.otpExpiration < Date.now()) {
    return res.send(fn.sendResponse(400,'Error!','error','OTP expired. Please request a new one.'))
  }

  return res.send({success:true,link:'/reset-password'})
}

exports.resetPassword = async (req, res) => {
  const {password, confirm} = req.body
  const {user_data} = req.session
  
  if(password !== confirm){
    return res.send(fn.sendResponse(400, 'Error!', 'error', 'Passwords does not match'))
  }

  const pass = fn.validatePassword(password)
  
  if(typeof pass === 'string'){
    return res.send(fn.sendResponse(400, 'Error!', 'error', pass))
  }else if(typeof pass === 'boolean' && pass === false){
    return res.send(fn.sendResponse(400, 'Error!', 'error', 'Password not correct'))
  }

  const hashedPass = await bcrypt.hash(password,10)
  await User.findOneAndUpdate({email:user_data.email},{
    $set: {password: hashedPass}
  }).then(()=>{
    res.send(fn.sendResponse(200, 'Success!', 'success', 'Password updated successfully'))
  }).catch(err => {
    console.log(err)
  })
}

exports.getResetPassword = (req, res) => {
  res.render('user/reset_password')
}

/* Login Section */
exports.getLogin = (req, res) => {
  res.render('user/login',{
    login_info: req.session.login_info,
    login_values: req.session.login_values,
    cartItemsCount: 0,
    wishlist: [],
    isAdmin: false
  })
}

exports.doLogin = async (req, res) => {

  let pInfo = {}, pValue = {};
  Object.entries(req.body)
    .filter(obj => !obj[1].length)
    .map(obj => {
      let key = obj[0] === 'password' ? obj[0].replace('_'," ") : 'this field'
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
    req.session.login_values = pValue;
  }else{
    req.session.login_values = null
  }

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    req.session.login_info = pInfo
    return res.redirect('/login')
  }

  const {val, password} = req.body;
  const isEmail = fn.validateEmail(val)

  let user;
  if(isEmail) user = await User.findOne({email:val});
    else 
      user =  await User.findOne({username:val});

  if(!user){
    req.session.login_info = fn.sendResponse(401, 'Error!', 'error', 'User does not exists')
    return res.redirect('/login')
  }

  if(user.password){
    const isMatch = await bcrypt.compare(password, user.password)
  
    if(!isMatch){
      req.session.login_info = fn.sendResponse(401, 'Error!', 'error', 'Wrong password entered')
      return res.redirect('/login')
    }
  }else{
    req.session.login_info = fn.sendResponse(401, 'Error!', 'error', 'Password not found, use google login instead')
    return res.redirect('/login')
  }

  if(user.isBlocked){
    req.session.login_info = fn.sendResponse(401, 'Error!', 'error', 'Your account is temporarily blocked')
    return res.redirect('/login')
  }

  req.session.user = user

  res.redirect('/')

}

exports.googleLogin = async (req,res) =>{
  
  const user = await User.findOne({email:req.user.email})
  if(user.isBlocked){
    req.session.login_info = fn.sendResponse(401, 'Error!', 'error', 'Your account is temporarily blocked')
    return res.redirect('/login')
  }
  req.session.user = user
  res.redirect('/')
}

/* Account Section */

exports.viewAccount = async (req, res) =>{
  
  const user_id = req.session.user._id;
  let user = await User.findOne({_id: user_id}).populate('address_list')
  const address = await Address.findOne({_id:user.default_address})
  const transactionsData = await Transaction.find({user_id}).sort({createdAt: -1})
  const transactions = transactionsData.map(item => {
    item.transaction_amount = item.transaction_amount.toFixed(2),
    item.current_balance = item.current_balance.toFixed(2)
    return item
  })
  const wishlist = await User.findById(req.session.user._id).populate('wishlist.product').then(user => user.wishlist)
  const productsWithOffer = await Promise.all(wishlist.map(async item => {
    const newItem = {
      _id: item._id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      product: await fn.getProductsWithOffers(item.product)
    }
    return newItem
  }))

  const ordersList = await Order.find({user_id})
            .populate('billing_address')
            .populate('shipping_address')
            .sort({createdAt: -1})

            
  // Process each order to get order items
  const orders = await Promise.all(ordersList.map(async(order) => {
    
    const orderItems = await Promise.all(order.cart.map(async (item) => {
      const product = await Product.findById(item.product_id);
      return {
        item_id: item._id,
        item_status: item.item_status,
        product_id: product._id,
        product_name: product.product_name,
        thumb: product.images[0],
        quantity: item.quantity,
        price: item.price,
        item_total: item.item_total,
      };
    }));
    
    return {
        ...order.toObject(),
        orderItems,
    };
  }));

  user.wallet = user.wallet.toFixed(2)

  
  return res.render('user/account',{
    user,
    isLogged: constants.isLogged,
    address,
    transactions,
    states: constants.STATES_INDIA,
    acc_info: req.session.acc_info,
    acc_values: req.session.acc_values,
    cartItemsCount: await fn.getCartItemsCount(user_id),
    wishlist: productsWithOffer,
    orders,
    isAdmin : false
  })
},

exports.addUserInfo = async (req, res) => {
  const user = req.session.user;
  const {edit} = req.query
  if(user){
    const {username,phone} = req.body
    const uname = await User.find({username});
    
    if(!edit && uname.length){
      return res.send(fn.sendResponse(400, 'Error!', 'error', 'This username already taken.'))
    }

    if(phone.length !== 10){
      return res.send(fn.sendResponse(400, 'Error!', 'error', 'Invalid Phone Number.'))
    }

    const data = {}
    Object.entries(req.body).filter(el => el[1].length).map(el => {
      data[el[0]] = el[1]
    })

    await User.findOneAndUpdate({_id:user._id},{
      $set:data
    }).then(()=>{
      return res.send(fn.sendResponse(201, 'Success!', 'success', 'Info added successfully'))
    }).catch(err => {
      return res.send(fn.sendResponse(500, 'Error!', 'error', 'Internal Server Error'))
    })
  }else{
    return res.send(fn.sendResponse(400, 'Error!', 'error', 'Please login to add profile'))
  }
}

exports.addAddress = async (req, res) => {

  let pInfo = {}, pValue = {};
  Object.entries(req.body)
    .filter(obj => obj[0] !== 'landmark' && !obj[1].length 
        || (obj[0] === 'phone' && obj[1].length !== 10)
        || obj[0] === 'pincode' && obj[1].length !== 6)
    .map(obj => {
      if(obj[0] === 'phone' && obj[1].length !== 10){
        pInfo[obj[0]] = 'Enter correct phone number'
      }else if(obj[0] === 'pincode' && obj[1].length !== 6){
        pInfo[obj[0]] = 'Enter correct pincode'
      } else{
        let key = obj[0].replace('_'," ");
        pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      }
      return pInfo
    })

  Object.entries(req.body)
    .filter(obj => obj[1].length)
    .map(obj => {
      
      pValue[obj[0]] = obj[1]
      return pValue
    })
    
  if(Object.keys(pValue).length){
    req.session.acc_values = pValue;
  }else{
    req.session.acc_values = null
  }
  
  //return validation messages on blank
  if(Object.keys(pInfo).length){
    pInfo.address_error = true
    req.session.acc_info = pInfo
    return res.send({success: false})
  }

  // add checkbox recognition for isDefault
  req.body.default = req.body.default ?? ''

  const {fullname, phone, email, address, street, landmark, city, pincode, state, country} = req.body

  const user = req.session.user; //await User.findOne({_id:req.session.user._id})
  const {address_list} = user
  const isDefault = req.body.default === 'on' || !address_list || address_list.length === 0
  const adress = await new Address({
    user_id: user._id,
    fullname,
    phone, 
    email, 
    address, 
    street, 
    landmark, 
    city, 
    pincode, 
    state, 
    country,
    isDefault
  })

  // if user selected this as default address, update other addresses to isDefault false
  if(address_list && address_list.length > 1 && isDefault){
    await Address.updateMany({user_id:user._id},{
      $set:{isDefault: false}
    })
  }

  const savedAddress = await adress.save();
  user.address_list.push(savedAddress._id)
  if(isDefault) user.default_address = savedAddress._id

  await User.findOneAndUpdate({_id:user._id},{
    $set: {
      address_list: user.address_list,
      default_address: user.default_address
    }
  }).then(()=> {
    req.session.acc_info = fn.sendResponse(201, 'Success!', 'success', 'Address added successfully')
    //return res.redirect('/user/account')
    res.send({success:true})
  }).then(() => {
    req.session.acc_info = null
  }).catch(err => {
    console.log(err)
    req.session.acc_info = fn.sendResponse(500, 'Error!', 'error', 'Internal Server Error')
    res.send({success:true})
  })

}

exports.updateAddress = async (req, res) => {

  let pInfo = {}, pValue = {};
  Object.entries(req.body)
    .filter(obj => obj[0] !== 'landmark' && !obj[1].length 
        || (obj[0] === 'phone' && obj[1].length !== 10)
        || obj[0] === 'pincode' && obj[1].length !== 6)
    .map(obj => {
      if(obj[0] === 'phone' && obj[1].length !== 10){
        pInfo[obj[0]] = 'Enter correct phone number'
      }else if(obj[0] === 'pincode' && obj[1].length !== 6){
        pInfo[obj[0]] = 'Enter correct pincode'
      } else{
        let key = obj[0].replace('_'," ");
        pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      }
      return pInfo
    })

  Object.entries(req.body)
    .filter(obj => obj[1].length)
    .map(obj => {
      
      pValue[obj[0]] = obj[1]
      return pValue
    })
    
  if(Object.keys(pValue).length){
    req.session.acc_values = pValue;
  }else{
    req.session.acc_values = null
  }

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    pInfo.address_error = true
    req.session.acc_info = pInfo
    return res.redirect('/user/account')
  }

  // add checkbox recognition for isDefault
  req.body.default = req.body.default ?? ''
  const {id} = req.params

  const {fullname, phone, email, address, street, landmark, city, pincode, state, country} = req.body

  const user = await User.findOne({_id:req.session.user._id})
  const {address_list} = user
  const isDefault = !address_list || address_list.length === 0 || req.body.default === 'on'

  if(address_list.length > 1 && isDefault){
    await Address.updateMany({user_id:user._id},{
      $set:{isDefault: false}
    })
  }

  const updatedAddress = await Address.findOneAndUpdate({_id:id},{
    $set: {
      fullname,
      phone,
      email,
      address,
      street,
      landmark,
      city,
      pincode,
      state,
      country,
      isDefault
    }
  });
  
  if(isDefault) user.default_address = updatedAddress._id

  await User.findOneAndUpdate({_id:user._id},{
    $set: {
      default_address: updatedAddress._id
    }
  }).then(()=> {
    req.session.acc_info = fn.sendResponse(201, 'Success!', 'success', 'Address updated successfully')
    res.redirect('/user/account')
  }).then(() => {
    req.session.acc_info = null
  }).catch(err => {
    console.log(err)
    req.session.acc_info = fn.sendResponse(500, 'Error!', 'error', 'Internal Server Error')
    return res.redirect('/user/account')
  })
}

exports.removeAddress = async (req, res) => {
  const {id} = req.params
  const user = await User.findOne({_id:req.session.user._id})
  user.address_list.splice(user.address_list.indexOf(id), 1)
  if(user.default_address === id) user.default_address = user.address_list[0] || ''

  await user.save()
  await Address.findByIdAndDelete(id).then(() => {
    return res.send(fn.sendResponse(200, 'Success!', 'success', 'Address deleted successfully'))  
  }).catch(err => {
    console.log(err)
    return res.send(fn.sendResponse(500, 'Error!', 'error', 'Internal Server Error'))
  })
}

exports.makeDefaultAddress = async (req, res) => {
  const {id} = req.params
  const user = await User.findOne({_id:req.session.user._id})
  user.default_address = id
  await Address.updateMany({user_id:user._id, _id:{$ne:id}},{
    $set:{isDefault: false}
  }).catch(err => {
    console.log(err)
  })
  
  await Address.findByIdAndUpdate(id,{
    $set: {isDefault: true}
  }).then(()=>{
    return res.send({success:true})
  }).catch(err => {
    console.log(err)
    return res.send(fn.sendResponse(500, 'Error!', 'error', 'Internal Server Error'))
  })

  user.save().catch(err => {
    console.log(err)
  })
  
}

exports.changePassword = async (req, res) => {
  const {user_id} = req.params
  const {password, confirm} = req.body
  
  if(password !== confirm){
    req.session.acc_info = fn.sendResponse('password_error', 'Error!', 'error', 'Passwords do not match')
    return res.redirect('/user/account')
  }

  const pass = fn.validatePassword(password)
  
  if(typeof pass === 'string'){
    req.session.acc_info = fn.sendResponse('password_error', 'Error!', 'error', pass)
    return res.redirect('/user/account')
  }else if(typeof pass === 'boolean' && pass === false){
    req.session.acc_info = fn.sendResponse('password_error', 'Error!', 'error', 'Password not correct')
    return res.redirect('/user/account')
  }

  const hashedPass = await bcrypt.hash(password,10)
  await User.findOneAndUpdate({_id:user_id},{
    $set: {password: hashedPass}
  }).then(()=>{
    req.session.acc_info = fn.sendResponse(200, 'Success!', 'success', 'Password updated successfully')
    res.redirect('/user/account')
  }).catch(err => {
    console.log(err)
  })
}

exports.selectAddress = async (req, res) => {
  
  const {id, type, index} = req.body
  const user = await User.findOne({_id:req.session.user._id})
  user.selected_address = id
  await user.save()
  const selectedAddress = await Address.findById(id)
  if(type === 'billing'){
    req.session.billing_address = selectedAddress
  }else{
    req.session.shipping_address = selectedAddress
  }
  return res.send({success:true, index: index, selectedAddress: selectedAddress}) 
}

exports.addToWallet = async (req, res) => {
  
  const {payment_method,transaction_amount,description} = req.body
  const user = await User.findById(req.session.user._id)
  const transaction = new Transaction({
    user_id: req.session.user._id,
    transaction_id: '#'+fn.generateUniqueId(),
    payment_method,
    transaction_type: 'deposit',
    transaction_amount,
    current_balance: parseFloat(user.wallet) + parseFloat(transaction_amount),
    description
  })

  await transaction.save().then(async () => {
    await User.findOneAndUpdate({_id:req.session.user._id},{
      $inc: {wallet: transaction_amount}
    }).then(() => {
      req.session.acc_info = fn.sendResponse(201,'Success','success','Transaction successful')
      res.redirect('/user/account')
    }).catch(err => {
      console.log(err)
      req.session.acc_info = fn.sendResponse(500,'Error','error','Internal Server Error')
      res.redirect('/user/account')
    })
  }).catch(err => {
    console.log(err)
    req.session.acc_info = fn.sendResponse(500,'Error','error','Transaction failed')
    res.redirect('/user/account')
  })

},

exports.logout = (req, res) => {
  req.session.destroy()
  return res.redirect('/')
},

exports.clearSession = (req, res) => {
  
  const {status} = req.params
  const {redirect, destroy} = req.query
  
  if(status == 201){
    req.session.signup_info = null
    req.session.signup_values = null
    req.session.login_info = null
    req.session.login_values = null
    req.session.user_data = null
    req.session.acc_info = null
    req.session.acc_values = null
    return res.send({status: 201})
  }else{
    if(destroy){
      req.session.signup_info = null
      req.session.login_info = null
      req.session.acc_info = null
    }
    if(redirect && redirect.length) return res.send({redirect:true})
  }
}

const mailTemplate = (name, otp) => {
  name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  return `<!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                  body {
                      font-family: Arial, sans-serif;
                      background-color: #f4f4f4;
                      margin: 0;
                      padding: 0;
                  }
                  .container {
                      width: 100%;
                      padding: 20px;
                      background-color: #fff;
                      margin: 20px auto;
                      border-radius: 8px;
                      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                  }
                  .header {
                    display: flex;
                    padding: 10px 30px;
                  }
                  .logo-wrapper{
                    width: 150px;
                    margin-right: 20px;
                    border: 1px solid #dfdfdf;
                    border-radius: 30px;
                    display: inline-flex;
                    align-items: center;
                    padding: 10px 20px;
                  }
                  .logo-wrapper img{
                    width: 100%;
                  }
                  .content {
                      padding: 20px;
                  }
                  .otp{
                    border: 1px solid #c8c8c8;
                    display: inline-flex;
                    padding: 10px 20px;
                    font-size: 30px;
                    letter-spacing: 10px;
                  }
                  .footer {
                      text-align: center;
                      padding: 10px;
                      font-size: 12px;
                      color: #666;
                  }
              </style>
          </head>
          <body>
              <div class="container">
                  <div class="header">
                    <div class="logo-wrapper">
                      <img src="admin/images/icons/logo.svg" alt="">
                    </div>
                      <h1>Welcome to Cyber Ecom</h1>
                  </div>
                  <div class="content">
                      <p>Dear <strong>${name}</strong>,</p>
                      <p>Thank you for signing up for our service. We’re excited to have you on board!</p>
                      <p>Please confirm your email address by entering this OTP.</p>
                      <p class="otp">${otp}</p>
                      <p>If you did not create an account, no further action is required.</p>
                  </div>
                  <div class="footer">
                      <p>&copy; 2024 Cyber Ecom. All rights reserved.</p>
                  </div>
              </div>
          </body>
          </html>`
}