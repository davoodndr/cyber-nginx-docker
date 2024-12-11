const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController')
const productController = require('../controllers/user/productController')
const orderController = require('../controllers/orderController')
const middleware = require('../middleware/userMiddleware');
const passport= require('passport');

/* Auth */
router.get('/',userController.getHome)
router.get('/signup',middleware.isLogin,userController.getSignup)
router.post('/do-signup',userController.doSignup)
router.get('/get-verify-otp',middleware.isLogin,userController.getVerify)
router.post('/verify-otp',userController.verifyOTP)
router.get('/remove-timer',userController.removeTimer)
router.get('/clear-session/:status',userController.clearSession)
router.post('/resend-otp',userController.resendOTP)
router.get('/forgot-password',middleware.isLogin,userController.getForgotPassword)
router.post('/send-forgot-otp',userController.sendForgotOtp)
router.get('/verify-forgot-otp',userController.verifyForgotOTP)
router.get('/reset-password',middleware.isLogin,userController.getResetPassword)
router.patch('/update-password',userController.resetPassword)
router.get('/login',middleware.isLogin,userController.getLogin)
router.post('/do-login',userController.doLogin)
router.get('/logout',userController.logout)

/* Google Auth */
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email'],prompt: 'select_account'}))
router.get('/google/callback', passport.authenticate('google',
  {
    failureRedirect: '/login',
  }
),userController.googleLogin)

/* User Account */
router.get('/user/account',middleware.checkAccess,userController.viewAccount)
router.post('/add-profile-info',middleware.checkAccess,userController.addUserInfo)
router.post('/add-address',middleware.checkAccess,userController.addAddress)
router.post('/update-address/:id',middleware.checkAccess,userController.updateAddress)
router.post('/select-address',middleware.checkAccess,userController.selectAddress)
router.get('/delete-address/:id',middleware.checkAccess,userController.removeAddress)
router.post('/make-default-address/:id',middleware.checkAccess,userController.makeDefaultAddress)
router.post('/change-password/:user_id',middleware.checkAccess,userController.changePassword)

/* Wallet */
router.post('/add-to-wallet/:user_id',middleware.checkAccess,userController.addToWallet)

/* View Product */
router.get('/view-product/:slug',productController.viewProduct)
router.post('/add-review',productController.addReview)
router.get('/collections',productController.getCollections)
router.post('/collections/filter',productController.filterCollection)
router.get('/products/suggest',productController.getSuggestions)


/* Order */
router.get('/user/wishlist',middleware.checkAccess,orderController.getWishlist)
router.post('/add-to-wishlist',middleware.checkAccess,orderController.addOrRemoveWishlist)
router.delete('/remove-from-wishlist/:item_id',middleware.checkAccess,orderController.removeFromWishlist)
router.get('/user/cart',middleware.checkAccess,orderController.getCart)
router.post('/add-to-cart',middleware.checkAccess,orderController.addToCart)
router.delete('/remove-from-cart/:cart_id/:product_id',middleware.checkAccess,orderController.removeFromCart)
router.get('/user/checkout',middleware.checkAccess,orderController.getCheckout)
router.post('/place-order',middleware.checkAccess,orderController.placeOrder)
router.post('/verify-payment',middleware.checkAccess,orderController.verifyPayment)
router.get('/user/view-order',middleware.checkAccess,orderController.viewOrder)
router.patch('/cancel-item/:order_id/:item_id',middleware.checkAccess,orderController.cancelItem)
router.post('/apply-coupon',middleware.checkAccess,orderController.applyCoupon)
router.delete('/remove-coupon',middleware.checkAccess,orderController.removeCoupon)
router.get('/user/download-invoice',middleware.checkAccess,orderController.downloadInvoice)
router.post('/retry-payment',middleware.checkAccess,orderController.retryPayment)
router.get('/clear-order-session',orderController.clearOrderSession)

module.exports = router