const Product = require('../models/productModel');
const Category = require('../models/categoryModel')
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const fn = require('../helpers/functions');
const constants = require('../constants/constants')
require('dotenv').config()

exports.getProducts = async (req, res) => {
  const {from} = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const products = await Product.find().populate('category')
                    .skip(skip).limit(limit).sort({'createdAt':-1})
  products.forEach(async el => {
    let images = []
    el.images.forEach(img => {
      if(!img.match('/products')){
        let nam = img.split('-').pop()
        let imgNew = `/admin/images/uploads/products/${el.product_slug}/${nam}`
        images.push(imgNew)
      }
    })
    if(images.length){
      await Product.findByIdAndUpdate({_id:el._id},{
        $set:{images:images}
      })
    }
  })
  
  const count = await Product.countDocuments();
  const totalPages = Math.ceil(count / limit);

  if(from) {
    req.session.product_info = null;
    req.session.product_values = null
  }

  res.render('admin/products',{
    products, 
    product_info: req.session.product_info,
    pageName: 'products',
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    isAdmin: true
  });
}

exports.addProduct = async (req, res) => {

  return res.render('admin/addProduct',{
    pageName: 'products',
    categories: await Category.find(),
    product_info: req.session.product_info,
    product_values: req.session.product_values,
    isAdmin:true
  })
}

exports.publishProduct = async (req, res) => {

  /* Validation => */
  let pInfo = {}, pValue = {};
  req.body.images = req.files
  
  Object.entries(req.body)
  .filter(obj => { 
    
    if(Array.isArray(obj[1]) && obj[1].find(el => !Array.isArray(el) && typeof el === 'object' && Object.entries(el).filter(([_,val]) =>  !val.toString().length) )){
      return obj[1].find(el => !Array.isArray(el))
    }else{
      return !obj[1].length || (obj[0] === 'images' && req.body.error_images.length < 3)
    }
    
  })
  .map(obj => {
    
    let key;
    if(typeof obj[1] === 'object' && obj[1].find(el => !Array.isArray(el))){
      const elm = Object.entries(obj[1].find(el => !Array.isArray(el))).filter(([_,val]) =>  !val || !val.toString().length);
      
      elm.forEach(k => {
        key = k[0].replace('_'," ");
        pInfo[k[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      })
      if(obj[0] === 'images' && obj[1].length < 3){
        key = obj[0].replace('_'," ");
        pInfo[obj[0]] = 'Atleat 3 images required.'
      }
    }else{
      if(obj[0] === 'images'){
        if(!obj[1].length){
          key = obj[0].replace('_'," ");
          pInfo[obj[0]] =  `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
        }
        if(obj[1].length < 3){
          key = obj[0].replace('_'," ");
          pInfo[obj[0]] = 'Atleat 3 images required.'
        }
        
      }else{
        key = obj[0].replace('_'," ");
        pInfo[obj[0]] =  `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      }
      
    }
    
    return pInfo
  });
  
  Object.entries(req.body) 
    .filter(obj =>{
      if(Array.isArray(obj[1])){
        if(obj[1].find(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val).length > 0))
          return obj[1].filter(el => !Array.isArray(el))
      }else{
        return obj[1].length 
      }
    })
    .map(obj => {

      if(obj[0] === 'images'){
        const images = obj[1].map(image => {
          return {
            base64: `data:image/jpg;base64,${image.buffer.toString('base64')}`,
            filename: image.originalname,
          }
        })
        pValue['images'] = images
      }else{
        pValue[obj[0]] = obj[1]
      }

      return pValue
  });

  if(Object.keys(pValue).length){
    req.session.product_values = pValue;
  }
  
  //return validation messages on blank
  if(Object.keys(pInfo).length){
    req.session.product_info = pInfo
    return res.send(fn.sendResponse(400,'Blank Data!','error','Fields can\'t blank!'))
  }

  /* Validatoin <= */
  
  /* Publishing => */

  let {product_name, product_slug, product_status,description,original_price,/* selling_price, */stock,brand,category,specifications,variants,images} = req.body

  if(parseFloat(original_price) <= 0 || parseFloat(stock) < 0){
    return res.send(fn.sendResponse(400,'Invalid Entry!','error','Please enter valid numbers!'))
  }

  
  const newProduct = {
    product_name,
    product_slug,
    product_status,
    description,
    pricing:{
      original_price
    },
    stock,
    brand,
    category,
    specifications,
    variants,
    images
  }

  const {section} = req.query

  await saveProduct(images,section,newProduct)
  .then(()=>{
    return res.send(fn.sendResponse(201,'Success!','success','Product created successfully'))
  }).catch((error) =>{
    if (error.code === 11000) {
      return res.send(fn.sendResponse(400,'Duplicate!','error','This product already exists!'))
    }
    // Handle other errors
    console.log(error)
    return res.send(fn.sendResponse(500,'Error!','error','Unknown Server error.'))
  })
  
}

exports.editProduct = async (req, res) => {
  const {slug} = req.params
  
  return res.render('admin/editProduct',{
    pageName: 'products',
    product: await Product.findOne({product_slug:slug}),
    categories: await Category.find(),
    product_info: req.session.product_info,
    product_values: req.session.product_values,
    isAdmin:true
  })
}

exports.deleteProduct = async (req, res) => {
  const {slug} = req.params

  await Product.findOneAndUpdate({product_slug:slug},{
    $set:{is_deleted:true,product_status: 'disabled'}
  }).then(() => {
    req.session.product_info = fn.sendResponse(200,'Success!','success','Product deleted successfully')
    return res.send({success:true})
  }).catch(err => {
    console.log(err);
  })
}

exports.deleteProductImage = async (req,res) => {
  
  const {slug} = req.params
  const {src} = req.query
  const dirPath = path.join(constants.UPLOAD_PATH, `products/${slug}`)
  const filePath = path.join(constants.UPLOAD_PATH, `products/${slug}`, src.split('/').pop());
  const product = await Product.findOne({product_slug:slug})

  if(product.images.length < 4 ) return res.send(fn.createToast(false,'error','Please keep 3 images for product.'))
  product.images = product.images.filter(image => image != src)
  fs.unlink(filePath,(async err =>{
    if(err){
      console.log(err) 
      res.send(fn.sendResponse(500,'Error!','error','Unknown Server error.'))
    }else{

      //delete from db
      await product.save()

      //delete folder if empty
      const files = fs.readdirSync(dirPath);
      if(files.length === 0){
        fs.rmdirSync(dirPath)
      }
      return res.send({status:200})
    }
  }))

}

exports.restoreProduct = async (req, res) => {
  const {slug} = req.params

  await Product.findOneAndUpdate({product_slug:slug},{
    $set:{is_deleted:false,product_status: 'active'}
  }).then(() => {
    req.session.product_info = fn.sendResponse(200,'Success!','success','Product restored successfully')
    return res.send({success:true})
  }).catch(err => {
    console.log(err);
  })
  
}

exports.updateProduct = async (req, res) => {
  
  /* Validation => */
  const {slug} = req.params;
  const {from, len, section} = req.query;
  req.body.images = req.files
  
  let pInfo = {}, pValue = {};
  
  Object.entries(req.body)
  .filter(obj => {
    
    if(Array.isArray(obj[1]) && obj[1].find(el => !Array.isArray(el) && Object.entries(el).filter(([_,val]) => !val.length))){
      
      return obj[1].find(el => !Array.isArray(el)) && (obj[0] !== 'images' || !(from == 'edit' && len > 2))
    }else{
      
      return !obj[1].length || (obj[0] === 'images' && from == 'edit' && len < 3 && obj[1].length < 3)
    }
  })
  .map(obj => {
    let key;
    if(typeof obj[1] === 'object' && obj[1].find(el => !Array.isArray(el))){
      const elm = Object.entries(obj[1].find(el => !Array.isArray(el))).filter(([_,val]) => !val || !val.toString().length);
      
      elm.forEach(k => {
        key = k[0].replace('_'," ");
        pInfo[k[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      })
    }else{
      if(obj[0] === 'images'){
        if(obj[1].length < 3  && from == 'edit' && len < 3){
          key = obj[0].replace('_'," ");
          pInfo[obj[0]] = 'Atleat 3 images required.'
        }
        if(!obj[1].length && from == 'edit' && !len){
          key = obj[0].replace('_'," ");
          pInfo[obj[0]] =  `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
        }
        
      }else{
        key = obj[0].replace('_'," ");
        pInfo[obj[0]] =  `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      }
    }
    return pInfo
  });

  Object.entries(req.body) 
    .filter(obj =>{
      if(Array.isArray(obj[1])){
        if(obj[1].find(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val).length > 0))
          return obj[1].filter(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val.length > 0))
      }else{
        return obj[1].length 
      }
    })
    .map(obj => {
      if(obj[0] === 'images'){
        const images = obj[1].map(image => {
          return {
            base64: `data:image/jpg;base64,${image.buffer.toString('base64')}`,
            filename: image.originalname,
          }
        })
        pValue['images'] = images
      }else{
        pValue[obj[0]] = obj[1]
      }
      return pValue
  });

  if(Object.keys(pValue).length){
    req.session.product_values = pValue;
  }

  //return validation messages on blank
  if(Object.keys(pInfo).length){
    req.session.product_info = pInfo
    return res.send(fn.sendResponse(400,'Error!','error','Blank fields detected.'))
  }

  /* Validatoin <= */
  
  /* Publishing => */

  let {product_name, product_slug, product_status,description,original_price,/* selling_price, */stock,brand,category,specifications,variants,images} = req.body
  
  if(parseFloat(original_price) <= 0 || parseFloat(stock) < 0){
    return res.send(fn.sendResponse(400,'Invalid Entry!','error','Please enter valid numbers!'))
  }

  const product = {
    product_name,
    product_slug,
    product_status,
    description,
    pricing:{
      original_price,
    },
    stock,
    brand,
    category,
    specifications,
    variants,
  }

  await updateProduct(images,section,product)
  .then(() => {
    return res.send(fn.sendResponse(201,'Success!','success','Product updated successfully'))
  }).catch((error) =>{
    // Handle other errors
    console.log(error)
    return res.send(fn.sendResponse(500,'Error!','error','Unknown Server error.'))
  })
}

exports.clearSession = (req, res) => {
  const {status} = req.params;
  if(status == 201){
    req.session.product_info= null;
    req.session.product_values= null;
    return res.send({status:200})
  }else if(status == 200){
    req.session.product_info= null;
    return res.send({status:200})
  }else{
    return res.send({status:status})
  }
}

const writeImage = async function(file, newFilename){
  await sharp(file.buffer)
        .resize(800, 800)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(`${newFilename}`);
}

const saveProduct = async (files,section,product) => {

  return new Promise(async (resolve,reject) => {
    try {
      const dir = path.join(constants.UPLOAD_PATH, `${section}/${product.product_slug}`);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir,{recursive: true});
      }
  
      const images = []

      const isExist = await Product.findOne(
        {
          $or:[{product_name:product.product_name},{product_slug:product.product_slug}]
        }
      )

      if(isExist){
        const err = new Error('This product already exists!')
        err.code = 11000
        throw err
      }
  
      await Promise.all(
        files.map(async (file) => {
          
          const filename = file.originalname.split('-').pop().replace(/\..+$/, '');
          const newFilename = `${filename}.jpg`
          await writeImage(file, `${dir}/${newFilename}`)
          const link = `/admin/images/uploads/${section}/${product.product_slug}/${newFilename}`
          images.push(link);
        })
      );
  
      product.images = images;

      console.log(product)
      
      const newProduct = new Product(product);
      await newProduct.save();

      resolve(newProduct);
  
    } catch (error) {
      console.error('Error Saving product:', error);
      reject(error);
    }
  })
  
};

const updateProduct = async (files,section,product) => {

  return new Promise(async (resolve,reject) => {
    try {
      const dir = path.join(constants.UPLOAD_PATH, `${section}/${product.product_slug}`);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir,{recursive: true});
      }
  
      const images = []
  
      await Promise.all(
        files.map(async (file) => {
          
          const filename = file.originalname.split('-').pop().replace(/\..+$/, '');
          const newFilename = `${filename}.jpg`
          await writeImage(file, `${dir}/${newFilename}`)
          const link = `/admin/images/uploads/${section}/${product.product_slug}/${newFilename}`
          images.push(link);
        })
      );

      const updatedProduct = await Product.findOneAndUpdate(
        {product_slug:product.product_slug},
        {
          $set: product,
          $addToSet: {images:images}
        },
        {new: true}
      )
  
      resolve(updatedProduct);
  
    } catch (error) {
      console.error('Error Saving product:', error);
      reject(error);
    }
  })
  
};