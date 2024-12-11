const Admin = require('../../models/adminModel');
const User = require('../../models/userModel');
const Order = require('../../models/orderSchema');
const fn = require('../../helpers/functions');
const moment = require('moment');
const mongoose = require('mongoose');
const {faker,simpleFaker} = require('@faker-js/faker');
const Product = require('../../models/productModel')

/* Auth */
exports.getLogin = async (req, res) => {
  res.render('admin/login', { errors: req.session.info, layout: 'admin/login' })
}

exports.doLogin = async (req, res) =>{
  try {
    
    const {email,password} = req.body
    if(email.trim().length < 1){
      req.session.info = {status:400, pass:password, email:'Please enter your email'}
      return res.redirect('/admin/login');

    }

    if(password.trim().length < 1){
      req.session.info = {status:400, mail:email, password:'Please enter the password'}
      return res.redirect('/admin/login');
    }
      
    const admin = await Admin.findOne({email})
    
    if(!admin) {
      req.session.info = {status:404, mail:email, pass:password, msg:'Account does not exists'}
      return res.redirect('/admin/login');
    }

    if(admin.password !== password){
      req.session.info = {status:401, mail:email, msg:'Incorrect password'}
      return res.redirect('/admin/login');
    }

    req.session.admin = true
    req.session.info = {admin, pageName: 'dashboard'}
    
    res.redirect('/admin/dashboard')

  } catch (error) {
    
  }
}

exports.getDashboard = async (req, res) => {

  let {skip = 1,limit = 5,page = 1,...filter} = req.query
  let dataFilter = req.query

  skip = (parseInt(page) - 1) * parseInt(limit);
  dataFilter.skip = parseInt(skip)
  dataFilter.limit = parseInt(limit)

  const data = await getSalesReport(dataFilter,null)
  const filtered = data.filtered.slice(skip, parseInt(skip)+parseInt(limit))
  const orders = data.total[0]
  const actualOrders = await getSalesReport(dataFilter,{payment_status:'paid',order_status:{$nin:['cancelled','return']}})

  const topSellings = await getTopSellings()
  const top_brands = topSellings[0].top_brands
  const top_categories = topSellings[0].top_categories
  const top_products = topSellings[0].top_products
  
  const groupedByQuantity = top_products.reduce((acc, product) => {
    const group = acc.find(group => group[0].sold_quantity === product.sold_quantity);
  
    if (group) {
      group.push(product);
    } else {
      acc.push([product]);
    }
    return acc;
  }, []);
  
  let final = groupedByQuantity.map(item => {
    if(item.length < 2) return item[0]
    else return {matched_items: item}
  })

  if(final.length > 6){
    final = final.slice(0,6)
  }

  const chartData = {
    validOrders: await getReport(dataFilter,{payment_status:'paid',order_status:{$nin:['cancelled','return']}}),
    cancelledOrdes: await getReport(dataFilter,{order_status: {$in:["cancelled","return"]}}),
    pendingOrders: await getReport(dataFilter,{payment_status:'unpaid',order_status:"pending"}),
  }

  //console.log(chartData)

  res.render('admin/dashboard',{
    pageName: 'dashboard',
    data: req.session.info,
    orders: actualOrders.total[0],
    filtered,
    filter,
    top_brands,
    top_products:final,
    top_categories,
    isAdmin:true,
    chartData
  })
}

const getReport = async function(dataFilter, orderType) {
  let {startDate,endDate, page, skip, limit, ...filter} = dataFilter
  let match = {}, projection = {},group = {_id:null}
  let dateFormat = 'DD-MM-YYYY'  // for foramt graph
  let format = 'DD-MM-YYYY'


  //default assign
  filter = Object.keys(filter).length ? filter : {today:true}

  if(filter.today){
    startDate = moment(),endDate = moment()
  }
  if(filter.daily || filter.weekly || filter.monthly || filter.yearly){
    startDate = null
    endDate = moment()
  }
  if(filter.yesterday){
    startDate = moment().subtract(1,'days')
    endDate = moment().subtract(1,'days')
  }
  moment.updateLocale('en', {
    week: { dow: 0 } // dow: 0 means Sunday is the first day of the week
  });
  if(filter.thisWeek){
    startDate = moment().startOf('week')
    endDate = moment().endOf('week')
    format = 'DD ddd'
  }
  if(filter.thisMonth){
    startDate = moment().startOf('month')
    endDate = moment().endOf('month')
  }
  if(filter.thisYear){
    startDate = moment().startOf('year')
    endDate = moment().endOf('year')
    format = 'MMM'
  }

  // generally projuction take day
  
  orderType ? match = orderType : {};

  if(startDate && endDate){
    startDate = moment(startDate, dateFormat).startOf('day').toDate();
    endDate = moment(endDate,dateFormat).endOf('day').toDate()
    match.createdAt = { $gte: startDate, $lte: endDate };

    if(moment(endDate).diff(moment(startDate),'days') === 0){
      projection = {date: {$dateToString: { format: "%H", date: "$createdAt", timezone: "Asia/Kolkata" } } }
      group._id = "$date"
      format = 'hh A'
      dateFormat = "hh A"
    }
  }

  if(filter.thisYear){
    projection = {month: {$dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group._id = "$month"
    dateFormat = "YYYY-MM"
  }

  if(filter.thisMonth || filter.weekly){
    projection = {date: {$dateToString: { format: "%Y-W%U", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group._id = "$date"
    dateFormat = 'YYYY-[W]ww'
    format = '[W-]ww'
  }

  if(filter.daily || filter.thisWeek || filter.custom){
    projection = {date: {$dateToString: { format: "%d-%m-%Y", date: "$createdAt", timezone: "Asia/Kolkata" } }}
    group._id = "$date"
  }

  if(filter.monthly){
    projection = {date: {$dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group.date = { $first: "$date"}
    format = 'YYYY-MMM'
  }

  if(filter.yearly){
    projection = {date: {$dateToString: { format: "%Y", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group.date = { $first: "$date"}
    format = 'YYYY'
  }

  const result = await Order.aggregate([
    { $match: {...match}},
    { $project: {
        ...projection, order_total:1,
      }
    },
    {
      $group: {
        ...group, 
        revenue:{$sum:"$order_total"},
      }
    },
    {
      $sort: { _id: 1}
    }
  ])

  const dates = [];
  const currentYear = new Date().getFullYear();

  if(filter.thisYear){
    for (let month = 0; month < 12; month++) {
      const monthStr = `${currentYear}-${String(month + 1).padStart(2, '0')}`;
      dates.push(monthStr);
    }
  }

  if(filter.thisMonth){
    for (let i = 1; i < 5; i++) {
      result.forEach(item => {
        let startOfWeek = moment(item._id + '-1', "YYYY-[W]WW-D");
        let weekOfMonth = Math.ceil(startOfWeek.date() / 7);
        item._id = `${currentYear}-0${weekOfMonth}`
      })
      dates.push(`${currentYear}-0${i}`);
    }
  }

  if(filter.thisWeek){
    for (let day = 1; day <= 7; day++) {
      const dayOfWeek = moment().weekday(day - 1).format(dateFormat);
      dates.push(dayOfWeek);
    }
  }


  if(filter.today || filter.yesterday){
    for (let hr = 0; hr < 24; hr++) {
      dates.push(`${hr < 10 ? '0'+hr : hr}`);
    }
  }

  const mergedData = dates.map(date => {
    const sales = result.find(item => item._id === date);
    date = moment(date,dateFormat).format(format)
    return {
      date,
      revenue: sales ? sales.revenue.toFixed(2) : 0,
    };
  });

  return mergedData
}

const getSalesReport = async function(dataFilter, orderType){

  let {startDate,endDate, page, skip, limit, ...filter} = dataFilter
  let match = {}, projection = {},group = {_id:null}
  let dateFormat = 'DD-MM-YYYY'  // for foramt graph
  let format = 'DD-MM-YYYY'


  //default assign
  filter = Object.keys(filter).length ? filter : {today:true}

  if(filter.today){
    startDate = moment(),endDate = moment()
  }
  if(filter.daily || filter.weekly || filter.monthly || filter.yearly){
    startDate = null
    endDate = moment()
  }
  if(filter.yesterday){
    startDate = moment().subtract(1,'days')
    endDate = moment().subtract(1,'days')
  }
  moment.updateLocale('en', {
    week: { dow: 0 } // dow: 0 means Sunday is the first day of the week
  });
  if(filter.thisWeek){
    startDate = moment().startOf('week')
    endDate = moment().endOf('week')
    format = 'DD ddd'
  }
  if(filter.thisMonth){
    startDate = moment().startOf('month')
    endDate = moment().endOf('month')
    format = 'DD ddd'
  }
  if(filter.thisYear){
    startDate = moment().startOf('year')
    endDate = moment().endOf('year')
    format = 'MMM'
  }

  // generally projuction take day
  
  orderType ? match = orderType : {};

  if(startDate && endDate){
    startDate = moment(startDate, dateFormat).startOf('day').toDate();
    endDate = moment(endDate,dateFormat).endOf('day').toDate()
    match.createdAt = { $gte: startDate, $lte: endDate };

    if(moment(endDate).diff(moment(startDate),'days') === 0){
      projection = {date: {$dateToString: { format: "%H:%M:%S", date: "$createdAt", timezone: "Asia/Kolkata" } } }
      group.date = { $first: "$date" }
      format = 'hh:mm A'
    }
  }

  if(filter.daily || filter.thisWeek || filter.thisMonth || filter.thisYear || filter.custom){
    projection = {date: {$dateToString: { format: "%d-%m-%Y", date: "$createdAt", timezone: "Asia/Kolkata" } }}
    group.date = { $first: "$date" }
  }

  if(filter.weekly){
    projection = {date: {$dateToString: { format: "%Y-W%U", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group.date = { $first: "$date"}
    format = 'YYYY-[W]ww'
  }

  if(filter.monthly){
    projection = {date: {$dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group.date = { $first: "$date"}
    format = 'YYYY-MMM'
  }

  if(filter.yearly){
    projection = {date: {$dateToString: { format: "%Y", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group.date = { $first: "$date"}
    format = 'YYYY'
  }

  const result = await Order.aggregate([
    { $match: {...match}},
    { $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer'},
    { $unwind: '$cart'},
    { $project: 
      {
        ...projection, 
        order_no:1,
        username: "$customer.username",
        fullname: "$customer.fullname",
        quantity: "$cart.quantity",
        refund: "$cart.refund_amount",
        isRefunded: "$cart.isRefunded",
        tax: "$cart.item_tax",
        discounts: 1,
        payment_method: 1,
        payment_status: 1,
        order_status: {
          $cond: {
            if: {
              $and: [
                { $ne: ["$order_status", "cancelled"] },
                { $eq: ["$cart.isRefunded", true] }
              ]
            },
            then: "partially cancelled",
            else: "$order_status"
          }
        },
        order_total: {
          $cond: {
            if: {
              $and: [
                { $ne: ["$order_status", "cancelled"] },
                { $eq: ["$cart.isRefunded", true] }
              ]
            },
            then: { $subtract: ["$order_total", "$cart.refund_amount"] },
            else: "$order_total"
          }
        },
      }
    },
    {
      $group: 
      {
        _id: "$order_no",
        date: { $first: "$date"},
        username: { $first: "$username"},
        fullname: { $first: "$fullname"},
        isRefunded: { $push: "$isRefunded"},
        quantity: { $push: "$quantity"},
        refund: { $push: "$refund"},
        tax: { $push: "$tax"},
        discounts: { $first: "$discounts"},
        order_total: { $push: "$order_total"},
        payment_method: { $first: "$payment_method"},
        payment_status: { $first: "$payment_status"},
        order_status: { $push:"$order_status" }

      }
    },
    
    {$sort: {date: 1}},
  ])


  const filtered = formatReport(result, filter, format)

  return {
    filtered: filtered,
    total: [{
      tax: filtered.reduce((a,b) => parseFloat(a) + parseFloat(b.tax), 0).toFixed(2),
      discounts: filtered.filter(el=> el.order_status !== 'cancelled' && el.payment_status === 'paid')
        .reduce((a,b) => parseFloat(a) + parseFloat(b.discounts), 0).toFixed(2),
      revenue: filtered.filter(el=> el.order_status !== 'cancelled' && el.payment_status === 'paid')
        .reduce((a,b) => parseFloat(a) + parseFloat(b.order_total),0).toFixed(2),
      sold_items: filtered.filter(el=> el.order_status !== 'cancelled' && el.payment_status === 'paid')
        .reduce((a,b) => parseFloat(a) + parseFloat(b.quantity), 0),
      count: filtered.length,
    }]
  }

}

const formatReport = function(data, filter,format){
  
  data.sort((a,b) => moment(b.date,format).valueOf() - moment(a.date,format).valueOf())

  return data.map(item => {
    let date = null
    if(filter.weekly){
      date = item.date
    }else if(filter.monthly){
      date = moment(item.date).format(format)
    }else if(filter.yearly){
      date = item.date
    }else{
      let itemFormat = fn.checkDateOrTime(item.date)
      itemFormat = itemFormat === 'date' ? 'DD-MM-YYYY' : 'HH:mm:ss'
      date = moment.parseZone(item.date,itemFormat).format(format)
      if(date === 'Invalid date') date = '00-00-00'
    }

    //console.log('item',item)

    const partialOrder = item.order_status.find(status => status === 'partially cancelled')

    if(partialOrder){
      item.isRefunded.forEach((el,index) => {
        // checking is refunded
        if(el === true){
          item.quantity = Array.isArray(item.quantity) ? item.quantity.filter((_,i)=> i !== index).reduce((acc,cur) => acc+ cur,0): item.quantity
          item.refund = Array.isArray(item.refund) ? item.refund[index] : item.refund
          item.tax = Array.isArray(item.tax) ? item.tax.filter((_,i)=> i !== index).reduce((acc,cur) => acc+ cur,0) : item.tax
          item.order_total = Array.isArray(item.order_total) ? item.order_total[index] : item.order_total
          item.order_status = 'partially cancelled'
        }
      })
    }else{
      item.quantity = item.quantity.reduce((acc,cur) => acc+ cur,0)
      item.refund = item.refund.reduce((acc,cur) => acc+ cur,0)
      item.tax = item.tax.reduce((acc,cur) => acc+ cur,0)
      item.order_total = item.order_total.reduce((acc,cur) => acc+ cur,0)
      item.order_status = item.order_status[0]
    }
    
    return {
      date,
      order_no: item._id,
      customer: item.fullname && item.fullname.length ? item.fullname : item.username,
      quantity: item.quantity,
      tax: item.tax,
      discounts: item.discounts.toFixed(2),
      order_total: item.order_total.toFixed(2),
      payment_method: item.payment_method,
      payment_status: item.payment_status,
      order_status: item.order_status
    }
  })
}

exports.getUsers = async (req, res) => {

  const users = await User.find().populate("default_address",["city","state","country"]);
  const userData = await Promise.all(users.map( async user => {
    const orders = await Order.find({user_id: user._id})
    return {
      ...user.toObject(),
      orders: orders.length
    }
  }))

  res.render('admin/users',{
    pageName: 'users',
    users: userData,
    isAdmin:true
  })
}

exports.blockUser = async (req,res) => {
  const {id} = req.params
  await User.findOneAndUpdate({_id:id},{
    $set:{isBlocked:true,user_status: 'blocked'}
  }).then(() => {
    req.session.user = null
    req.session.user_info = fn.sendResponse(200,'Success!','success','User blocked successfully')
  }).catch(err => {
    console.log(err);
    req.session.user_info = fn.sendResponse(400,'Error!','error','Some thing went wrog, Try again.')
  })

  return res.redirect('/admin/users')
}

exports.unblockUser = async (req,res) => {
  const {id} = req.params

  await User.findOneAndUpdate({_id:id},{
    $set:{isBlocked:false,user_status: 'active'}
  }).then(() => {
    req.session.user_info = fn.sendResponse(200,'Success!','success','User unblocked successfully')
  }).catch(err => {
    console.log(err);
    req.session.user_info = fn.sendResponse(400,'Error!','error','Some thing went wrog, Try again.')
  })

  return res.redirect('/admin/users')
}

exports.logout = (req,res) => {
  req.session.destroy()
  return res.redirect('/admin/login')
}

exports.clearSession = (req, res) => {
  const {status} = req.params
  const {redirect, destroy} = req.query
  if(status == 201){
    req.session.user_info = null
    return res.redirect(`/${redirect}`)
  }else{
    //console.log(destroy)
    if(destroy) req.session.signup_info = null
    if(redirect) return res.redirect(`/${redirect}`)
  }
}

const getTopSellings = async () => {
  return await Order.aggregate([
    { $match: { payment_status: 'paid',order_status: {$nin: ['cancelled','returned']} } },
    { $unwind: "$cart"},
    { $lookup: {
        from: 'products',
        localField: 'cart.product_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: "$product" },
    {
      $facet: {
        top_products: [
          {
            $lookup: {
              from: 'categories',
              localField: 'product.category',
              foreignField: '_id',
              as: 'category'
            }
          },
          {
            $group: {
              _id: "$cart.product_id",
              sold_quantity: { $sum: "$cart.quantity" },
              product_name: { $first: "$product.product_name" },
              category_name: { $first: "$category.category_name"},
              product_images: { $first: "$product.images"},
              product_price: { $first: "$product.pricing.selling_price" },
            }
          },
          {
            $project: {
              sold_quantity: 1,
              product_name: 1,
              product_image: { $arrayElemAt: ["$product_images", 0] },
              product_price: 1,
              category_name: { $arrayElemAt: ["$category_name", 0] },
              _id:0
            }
          },
          { $sort: {sold_quantity: -1}},
          /* { $limit: 6} */
        ],

        top_categories: [
          {
            $lookup: {
              from: 'categories',
              localField: 'product.category',
              foreignField: '_id',
              as: 'category'
            }
          },
          {
            $group: {
              _id: "$product.category",
              sold_quantity: { $sum: "$cart.quantity" },
              /* sales_revenue: { $sum: "$product.pricing.selling_price" }, */
              category_name: { $first: "$category.category_name" },
              products: { $addToSet: "$cart.product_id"}
            }
          },
          {
            $project: {
              sold_quantity: 1,
              /* sales_revenue: 1, */
              products: { $size: "$products"},
              category_name: { $arrayElemAt: ["$category_name", 0] },
              _id:0
            }
          },
          { $sort: {sold_quantity: -1}},
        ],

        top_brands: [
          {
            $group: {
              _id: "$product.brand",
              sold_quantity: { $sum: "$cart.quantity" },
              /* sales_revenue: { $sum: "$product.pricing.selling_price" }, */
              products: { $addToSet: "$cart.product_id"}
            }
          },
          {
            $project: {
              sold_quantity: 1,
              /* sales_revenue: 1, */
              products: { $size: "$products"},
            }
          },
          { $sort: {sold_quantity: -1}},
        ]
      }
    }
  ])
}

exports.inserData = async (req,res) => {
  for (let i = 0; i <= 10; i++) {
    await generateOrder()
  }
}

const generateCartItem = () => {

  const product = faker.helpers.arrayElement(products)
  return {
    product_id: product._id,
    item_status: faker.helpers.arrayElement(['pending', 'processed', 'shipped', 'delivered']),
    quantity: product.quantity,
    item_tax: parseFloat(product.item_tax) * parseFloat(product.quantity),
    price: parseFloat(product.price),
    item_total: parseFloat(product.price) * parseFloat(product.quantity)
  };
};

const generateOrderAddress = (type) => {
  const user = faker.helpers.arrayElement(users)
  return {
    user_id: user._id, // reference to a User
    address_type: type,
    fullname: faker.person.fullName(),
    phone: faker.phone.number(),
    email: faker.internet.email(),
    address: faker.location.streetAddress(),
    street: faker.location.street(),
    landmark: faker.location.secondaryAddress(),
    city: faker.location.city(),
    pincode: faker.location.zipCode(),
    state: faker.location.state(),
    country: faker.location.country()
  };
};

const generateOrder = async () => {
  
  const user = faker.helpers.arrayElement(users)
  const result = Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, generateCartItem)
  const uniqueProducts = {};
  const cartItems = [];

  result.forEach(product => {
    const { product_id } = product;

    if (uniqueProducts[product_id]) {
      uniqueProducts[product_id].quantity += product.quantity;
    } else {
      uniqueProducts[product_id] = { ...product };
    }
  });

  for (let key in uniqueProducts) {
    cartItems.push(uniqueProducts[key]);
  }


  const getRandomDate = (yearsAgo) => {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - yearsAgo);
    const endDate = new Date(); 

    const randomTimestamp = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
    return new Date(randomTimestamp);
  };

  const randomCreatedAt = getRandomDate(3);
  const randomUpdatedAt = getRandomDate(3); 

  
  const updatedAt = randomUpdatedAt > randomCreatedAt ? randomUpdatedAt : randomCreatedAt;

  // Generate fake order data
  const order = new Order({
    order_no: '#'+fn.generateUniqueId(),
    user_id: user._id,
    payment_method: faker.helpers.arrayElement(['razorpay']),
    payment_status: faker.helpers.arrayElement(['unpaid', 'paid']),
    payment_id: 'pay_'+faker.string.alphanumeric(14),
    razorpay_order_id: 'order_'+faker.string.alphanumeric(14),
    order_status: faker.helpers.arrayElement(['pending', 'confirmed', 'shipped', 'delivered']),
    order_subtotal: cartItems.map(item => parseFloat(item.item_total)).reduce((acc,curr) => acc+curr,0), // subtotal for the order
    tax: cartItems.map(item => parseFloat(item.item_tax)).reduce((acc,curr) => acc+curr,0), // Assuming tax is calculated later or fixed
    coupons: [], // Add fake coupon IDs if needed
    offers: [], // Add fake offer IDs if needed
    discounts: faker.number.float({min: 20, max: 1500}), // Random discount amount
    shipping_charge: 100, // Shipping charge
    order_total: 0, // Total will be calculated later
    cart: cartItems, // Random cart with 1 to 5 items
    billing_address: generateOrderAddress('billing'),
    shipping_address: generateOrderAddress('shipping'),
    createdAt: randomCreatedAt,
    updatedAt: updatedAt
  });

  // Calculate order total
  order.order_total = order.order_subtotal + order.tax + order.shipping_charge - order.discounts;

  // Save the generated order
  await order.save();
  //console.log('Fake order saved:', order);
};

const users = [
  {
    _id: new mongoose.Types.ObjectId('6711c46d731d478ccdad43f6'),
  },
  {
    _id: new mongoose.Types.ObjectId('6712192a397dcef4eb7ea766'),
  }
]

const products = [
  {
    _id: new mongoose.Types.ObjectId('670a6f0bef86d3f49935b5cf'),
    price: 98500,
    item_tax: 4800,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
  {
    _id: new mongoose.Types.ObjectId('670a8e22338415bfd8416c08'),
    price: 55000,
    item_tax: 2730.25,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
  {
    _id: new mongoose.Types.ObjectId('670a924691c3d24143f39873'),
    price: 31000,
    item_tax: 1468,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
  {
    _id: new mongoose.Types.ObjectId('670b5a815fb5dca92719e0bf'),
    price: 9360,
    item_tax: 399.95000000000005,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
  {
    _id: new mongoose.Types.ObjectId('670b5ff287c520a5f201ac66'),
    price: 90000,
    item_tax: 4222.5,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
  {
    _id: new mongoose.Types.ObjectId('670b6e1d2b736f63f8f5ad75'),
    price: 3000,
    item_tax: 118.2,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
  {
    _id: new mongoose.Types.ObjectId('670be699a328d041b72a1f93'),
    price: 69600,
    item_tax: 2995,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
  {
    _id: new mongoose.Types.ObjectId('670beaa5bb3ea0806e0f126a'),
    price: 90200,
    item_tax: 4495,
    quantity: faker.number.int({ min: 1, max: 5 }),
  },
]