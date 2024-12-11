const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController')
const categoryController = require('../controllers/categoryController')
const productController = require('../controllers/productController')
const couponController = require('../controllers/admin/couponController')
const offerController = require('../controllers/admin/offerController')
const orderController = require('../controllers/admin/orderController')
const reportController = require('../controllers/admin/reportController')
const middleware = require('../middleware/adminMiddleware')
const {uploadImages, resizeImages} = require('../controllers/imageUploadController')

/* Admin */
router.get('/login',middleware.isLogin,adminController.getLogin)
router.post('/doLogin',adminController.doLogin)
router.get('/dashboard',middleware.checkSession,adminController.getDashboard)
router.get('/logout',middleware.checkSession,adminController.logout)

/* Users */
router.get('/users',middleware.checkSession,adminController.getUsers)
router.get('/block-user/:id',middleware.checkSession,adminController.blockUser)
router.get('/unblock-user/:id',middleware.checkSession,adminController.unblockUser)
router.get('/clear-session',adminController.clearSession)

/* Categories */
router.get('/categories',middleware.checkSession,categoryController.getCategories)
router.post('/add-category',categoryController.addCategory)
router.post('/update-category',categoryController.updateCategory)
router.delete('/delete-category/:id',categoryController.deleteCategory)
router.patch('/restore-category/:id',categoryController.restoreCategory)
router.get('/category/clear-session',categoryController.clearSession)

/* Products */
router.get('/products',middleware.checkSession,productController.getProducts)
router.get('/add-product',middleware.checkSession,productController.addProduct)
router.post('/publish-product',uploadImages,productController.publishProduct)
router.get('/products/:slug/edit',middleware.checkSession,productController.editProduct)
router.delete('/products/:slug/delete',middleware.checkSession,productController.deleteProduct)
router.post('/products/:slug/delete-image',middleware.checkSession,productController.deleteProductImage)
router.patch('/products/:slug/restore',productController.restoreProduct)
router.post('/products/:slug/update',uploadImages,productController.updateProduct)
router.get('/products/clear-session/:status',productController.clearSession)

/* Orders */
router.get('/orders',middleware.checkSession,orderController.getOrders)
router.get('/change-status/:order_id/:new_status',middleware.checkSession,orderController.changeOrderStatus)
router.get('/orders/clear-session/:status',orderController.clearSession)
router.get('/cancel-order/:order_id',middleware.checkSession,orderController.cancelOrder)
router.get('/view-order',middleware.checkSession,orderController.viewOrder)
router.get('/download-invoice',middleware.checkSession,orderController.downloadInvoice)

/* Coupons */
router.get('/coupons',middleware.checkSession,couponController.getCoupons)
router.post('/add-coupon',couponController.addCoupon)
router.put('/update-coupon/:coupon_id',couponController.updateCoupon)
router.patch('/disable-coupon/:id',couponController.disableCoupon)
router.patch('/restore-coupon/:id',couponController.restoreCoupon)
router.delete('/delete-coupon/:id',couponController.deleteCoupon)
router.get('/coupon/clear-session',couponController.clearSession)

/* Offers */
router.get('/offers',middleware.checkSession,offerController.getOffers)
router.post('/add-offer',offerController.addOffer)
router.put('/update-offer/:offer_id',offerController.updateOffer)
router.patch('/disable-offer/:id',offerController.disableOffer)
router.patch('/restore-offer/:id',offerController.restoreOffer)
router.delete('/delete-offer/:id',offerController.deleteOffer)
router.get('/offer/clear-session',offerController.clearSession)
router.get('/get-items/:item',offerController.getItmes)

/* Sales report */
router.get('/sales-report',middleware.checkSession,reportController.getReport)
router.get('/download-report-pdf',middleware.checkSession,reportController.downloadPDF)
router.get('/download-report-excel',middleware.checkSession,reportController.downloadEXCEL)

module.exports = router