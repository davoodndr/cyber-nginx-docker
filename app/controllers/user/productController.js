const Product = require("../../models/productModel");
const Category = require("../../models/categoryModel");
const Review = require("../../models/reviewModel");
const fn = require("../../helpers/functions");
const constants = require("../../constants/constants")
const User = require("../../models/userModel");
const Coupon = require("../../models/couponSchema");

const viewProduct = async (req, res) => {
	
	const { slug } = req.params;
	const { user } =  req.session;
	
	const product = await Product.findOne({ product_slug: slug });
	const productId = product._id;
	const category = await Category.findOne({ _id: product.category });
	const related_products = await Product.find({
		category: product.category,
		_id: { $ne: product._id },
	});

	const productsWithOffer = await Promise.all(related_products.map(async product => {
    return await fn.getProductsWithOffers(product._id)
  }))

	/* Coupon for product */
	const coupons = await Coupon.find({
		coupon_status:{$nin: ['disabled','expired']},
		applied_products:{$elemMatch:{$eq:productId}},
	})

	// to show message for used coupons
	const updatedCoupons =  coupons.map(coupon => {
		if(user && user.coupons.includes(coupon.coupon_code)){
			return {
				...coupon,
				used: true
			}
		}
		return coupon
	})


	return res.render("user/view_product", {
		user,
		isLogged: constants.isLogged,
		product: await fn.getProductsWithOffers(product._id),
		category,
		related_products: productsWithOffer,
		cartItemsCount: req.session.user ? await fn.getCartItemsCount(req.session.user._id) : 0,
    wishlist: req.session.user ? await fn.getWishlistItems(req.session.user._id) : [],
		coupons : updatedCoupons,
		isAdmin: false,
	});
};

const addReview = async (req, res) => {
	
	const { productId, user, rating, reviewTitle, reviewText } = req.body;

	if (parseInt(rating) <= 0) {
		return res.send(
			fn.sendResponse(400, "Error!", "error", "Please rate first!")
		);
	}
	if (!reviewText.length && reviewTitle.length) {
		if (parseInt(rating) <= 0) {
			return res.send(
				fn.sendResponse(400, "Error!", "error", "Please rate first!")
			);
		}
	}
	if (!reviewTitle.length && reviewText.length) {
		if (parseInt(rating) <= 0) {
			return res.send(
				fn.sendResponse(400, "Error!", "error", "Please rate first!")
			);
		} else {
			return res.send(
				fn.sendResponse(400, "Error!", "error", "Please add title first!")
			);
		}
	}
	if (reviewTitle.length && reviewText.length) {
		if (parseInt(rating) <= 0) {
			return res.send(
				fn.sendResponse(400, "Error!", "error", "Please rate first!")
			);
		}
	}

	//const existing = await Review.findOne({user: user,productId})

	const review = new Review({
		productId,
		user,
		rating,
		reviewText,
		reviewTitle,
	});

	await review
		.save()
		.then(() => {
			return res.send(
				fn.sendResponse(
					201,
					"Success!",
					"success",
					"Your review added Successfully!"
				)
			);
		})
		.catch((err) => {
			console.log(err);
			return res.send(
				fn.sendResponse(500, "Error!", "error", "Internal Server Error!")
			);
		});
};

const getCollections = async (req, res) => {

  const {category,search} = req.query;
	let categories, brands, cat, stocks;
  if(category) {
    cat = await Category.findOne({ _id: category })
    brands = await Product.aggregate([
      { $match: {category:cat._id}},
      { $group: { _id: "$brand", count: { $sum: 1 } } },
      { $project: { _id:0, brand:"$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]);
    stocks = await Product.aggregate([
      { $match: {category:cat._id}},
      { $group: { _id: "$stock", count: { $sum: 1 } } },
      { $project: { _id:0, stock:"$_id", count: 1 } },
      { $sort: { stock: 1 } },
    ]);
  }else{
    cat = null
    categories = await Category.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "category",
          as: "products",
        },
      },
      {
        $project: {
          category_id: 1,
          category_name: 1,
          /* products: 1, */
          product_count: { $size: "$products" },
        },
      },
    ]);

    brands = await Product.aggregate([
      { $group: { _id: "$brand", count: { $sum: 1 } } },
      { $project: { _id:0, brand:"$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]);

    stocks = await Product.aggregate([
      { $group: { _id: "$stock", count: { $sum: 1 } } },
      { $project: { _id:0, stock:"$_id", count: 1 } },
      { $sort: { stock: 1 } },
    ]);
  }

	return res.render("user/collections", {
		categories,
    stocks,
		brands,
		isLogged: constants.isLogged,
    category : cat,
		cartItemsCount: req.session.user ? await fn.getCartItemsCount(req.session.user._id) : 0,
    wishlist: req.session.user ? await fn.getWishlistItems(req.session.user._id) : [],
		isAdmin: false,
	});
};

const getSuggestions = async (req, res) => {
	const { search } = req.query;
	
	const products = await Product.aggregate([
    { $match: { product_name: new RegExp(search, 'i') } },
    { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "category" }},
    { $unwind: 
      { 
          path: "$category",
          preserveNullAndEmptyArrays: true 
      } 
    },
    { $project: { _id: 0, product_name: 1, category_name: "$category.category_name" }},
    { $limit: 10 },
  ]);
  let suggestions = [];
  products.forEach(element => suggestions.push(element.product_name, element.category_name));
  suggestions = suggestions.sort( () => .5 - Math.random() );
  return res.json({ suggestions });
};

const filterCollection = async (req, res) => {

	const { page = 1, pageSize = 8 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);
  
	const filters = {}, sort = {};

  if(req.body.search && req.body.search.trim().length > 0)  {
   filters.$or = [
    {product_name: new RegExp(req.body.search, 'i')},
    {product_slug: new RegExp(req.body.search, 'i')},
    {brand: new RegExp(req.body.search, 'i')}
   ]
  }

	if (req.body.categories) {
		filters.category = { $in: req.body.categories.split(",") };
	}

	if (req.body.brands) {
		filters.brand = { $in: req.body.brands.split(",") };
	}

	if (req.body.prices) {
		const selectedPrices = req.body.prices.split(",").map(Number);
		filters["pricing.selling_price"] = {
			$gte: selectedPrices[0],
			$lte: selectedPrices[1],
		};
	}

  if (req.body.stocks) {
		filters.stock = { $in: req.body.stocks.split(",") };
	}

  if(req.body.sort) {
    let sortField = req.body.sort;
    sortField = sortField === "price_hightolow" || "price_lowtohigh" ? "pricing.selling_price" : sortField;
    sort[sortField] = req.body.sortOrder === "asc"? 1 : -1
  }else{
    sort['createdAt'] = -1 //must here
  }

	const totalOrders = await Product.countDocuments();

	await Product.find(filters).sort(sort).skip(skip).limit(limit)
		.then(async (products) => {

			const produtsWithOffer = await Promise.all(products.map(async product => {
				return await fn.getProductsWithOffers(product._id)
			}))

			
			const totalPages = Math.ceil(totalOrders / pageSize);

			res.send({ payload: produtsWithOffer,totalPages, totalOrders, currentPage:page});
		})
		.catch((err) => {
			console.log(err);
			res.send({ payload: [] });
		});
};

module.exports = {
	viewProduct,
	addReview,
	getCollections,
	getSuggestions,
	filterCollection,
};

