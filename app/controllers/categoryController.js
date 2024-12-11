const Categories = require('../models/categoryModel')

/* Categories */
const getCategories = async (req, res) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const categories = await Categories.find().skip(skip).limit(limit)
  const count = await Categories.countDocuments();
  const totalPages = Math.ceil(count / limit);

  res.render('admin/categories',{
    categories, 
    cat_info: req.session.cat_info, 
    pageName: 'categories',
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    isAdmin: true
  });
}

const addCategory = async (req, res) => {
  let {category_name, category_status} = req.body
  if(category_name.length < 1){
    req.session.cat_info = {status: 400, st:category_status, name: 'Please enter category name'}
    return res.redirect('/admin/categories')
  }

  if(category_status.length < 1){
    req.session.cat_info = {status: 400, nam:category_name, stats: 'Please select stutus'}
    return res.redirect('/admin/categories')
  }

  let exist_category = await Categories.findOne({category_name});
  if(exist_category){
    req.session.cat_info = {status: 409, msg: 'This category already exists'}
    return res.redirect('/admin/categories')
  }

  const newCategory = new Categories({
    category_name,
    category_status
  })

  await newCategory.save().then(()=>{
    req.session.cat_info = {status:200, msg:'Category created successfully'}
  }).catch((error) =>{
    if (error.name === 'MongoError' && error.code === 11000) {
      // Duplicate key error
      req.session.cat_info = {msg:'Name already exists. Please choose another name.'};
    } else {
      // Handle other errors
      req.session.cat_info = {msg: 'An error occurred while creating the brand.'};
    }
  })
  
  return res.redirect('/admin/categories')
  
}

const updateCategory = async (req, res) => {
  let {id, category_name, category_status} = req.body
    
  if(category_name.length < 1){
    req.session.cat_info = {status: 400, st:category_status, name: 'Please enter category name'}
    return res.redirect('/admin/categories')
  }

  if(category_status.length < 1){
    req.session.cat_info = {status: 400, nam:category_name, stats: 'Please select stutus'}
    return res.redirect('/admin/categories')
  }

  let exist_category = await Categories.findOne({category_name, _id:{$ne:id}});
  if(exist_category){
    req.session.cat_info = {status: 409, msg: 'This category already exists'}
    return res.redirect('/admin/categories')
  }
  
  await Categories.findOneAndUpdate({_id:id},{
    $set: {category_name,category_status}
  }).then(() => {
    req.session.cat_info = {status:200, msg:'Category updated successfully'}
  }).catch((error) =>{
    if (error.name === 'MongoError' && error.code === 11000) {
      // Duplicate key error
      req.session.cat_info = {msg:'Name already exists. Please choose another name.'};
    } else {
      // Handle other errors
      req.session.cat_info = {msg: 'An error occurred while creating the brand.'};
    }
  })

  return res.redirect('/admin/categories')
}

const deleteCategory = async (req, res) => {
  const {id} = req.params

  await Categories.findOneAndUpdate({_id:id},{
    $set:{is_deleted:true,category_status: 'disabled'}
  }).then(() => {
    req.session.cat_info = {status:200, msg: 'Category deleted successfully'}
    res.send({success:true})
  }).catch(err => {
    console.log(err);
  })
}

const restoreCategory = async (req, res) => {
  const {id} = req.params
  
  await Categories.findOneAndUpdate({_id:id},{
    $set:{is_deleted:false,category_status: 'active'}
  }).then(() => {
    req.session.cat_info = {status:200, msg: 'Category restored successfully'}
    res.send({success:true})
  }).catch(err => {
    console.log(err);
  })
}

const clearSession = (req, res) => {
  req.session.cat_info = null;
  return res.redirect('/admin/categories')
}

module.exports = {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
  clearSession
}