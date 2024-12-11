
const Order = require('../../models/orderSchema');
const fn = require('../../helpers/functions');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');


exports.getReport = async (req, res) => {
  let {skip = 1,limit = 5,page = 1,...filter} = req.query
  let dataFilter = req.query

  skip = (parseInt(page) - 1) * parseInt(limit);
  dataFilter.skip = parseInt(skip)
  dataFilter.limit = parseInt(limit)

  const data = await getSalesReport(dataFilter,null)
  const report = data.filtered.slice(skip, parseInt(skip)+parseInt(limit))
  const total = data.total[0]

  const count = total.count
  const totalPages = Math.ceil(count / limit);

  return res.render('admin/sales_report',{
    report,
    pageName:'report',
    filter,
    total,
    skip,
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    isAdmin: true,
  })
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
    projection = {date: {$dateToString: { format: "%d-%m", date: "$createdAt", timezone: "Asia/Kolkata" } }},
    group.date = { $first: "$date"}
    format = 'DD ddd'
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

exports.downloadPDF = async(req,res) => {

  let filters = req.query
  const report = await getSalesReport(filters,null);

  const pdfData = await generatePDF(report,req.query);
  
  //res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');
  res.setHeader('Content-Disposition', 'inline; filename=sales_report.pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.end(pdfData);
}

const generatePDF = async (salesData,filter) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({margin:50});
    const buffer = [];

    doc.on('data', chunk => buffer.push(chunk));

    doc.on('end', () => {
      const pdfData = Buffer.concat(buffer);
      resolve(pdfData);
    });

    doc.on('error', (err) => {
      reject(err);
    });

    generateHeader(doc,filter);
	  
    generateInvoiceTable(doc,salesData)

    generateFooter(doc);

    doc.end();
  });
};

function generateHeader(doc,query) {

  let {skip = 1,limit = 5,page = 1,startDate= '', endDate= '',...filter} = query
  // filter empty while not selected any thing, set it as today
  filter = Object.keys(filter).length > 0 ? filter : {today: true}

  const dynamicTitle = Object.keys(filter)[0].charAt(0).toUpperCase() + Object.keys(filter)[0].slice(1).toLowerCase()

	doc.image('public/admin/images/icons/logo.png', 50, 45, { width: 70 })
		.fillColor('#444444')
		.fontSize(12)
		.text('E-commerce', 50, 70)
    .fontSize(20)
    .text(`${dynamicTitle} Sales Report`, 0, 90, {align: 'center'})
    .fontSize(10)
    .text('Generated on:'+ new Date().toLocaleString(), 0, 115, { align: 'center' })
		.fontSize(10)
		.text('Park Avenue', 200, 55, { align: 'right' })
		.text('Calicut, India, 676001', 200, 70, { align: 'right' })
		.moveDown();
}

function generateFooter(doc) {
	doc.fontSize(
		10,
	).text(
		'Payment is due within 15 days. Thank you for your business.',
		50,
		730,
		{ align: 'center', width: 500 },
	);
}

function generateInvoiceTable(doc, invoice) {
  let i;
  const invoiceTableTop = 160;

  function checkPageBreak(position, doc) {
    const pageHeight = doc.page.height;
    const marginBottom = doc.page.margins.bottom;
    
    if (position > pageHeight - marginBottom - 30) { 
      doc.addPage();
      return invoiceTableTop;
    }
  
    return position;
  }

  doc.font("Helvetica-Bold");
  generateTableRow(
    doc,
    invoiceTableTop,
    "Date/Time",
    "Customer",
    "Products",
    "Tax",
    "Discounts",
    "Total",
    "Payment",
    "Status"
  );
  generateHr(doc, invoiceTableTop + 20);
  doc.font("Helvetica");

  const orderData = invoice.filtered

  let position = invoiceTableTop + 30;

  for (i = 0; i < orderData.length; i++) {
    const item = orderData[i];
    //const position = invoiceTableTop + (i + 1) * 30;
    position = checkPageBreak(position, doc);

    generateTableRow(
      doc,
      position,
      item.date,
      item.customer,
      item.quantity,
      item.tax,
      item.discounts,
      item.order_total,
      item.payment_method,
      item.order_status
    );

    generateHr(doc, position + 20);

    position += 30;
  }

  const summery = invoice.total[0]
  
  //const totalsPosition = invoiceTableTop + (i + 1) * 30
  position = checkPageBreak(position, doc);
  doc.font("Helvetica-Bold");
  generateTableRow(
    doc,
    //totalsPosition,
    position,
    "Totals:",
    "",
    summery.sold_items,
    summery.tax,
    summery.discounts,
    summery.revenue,
  );

  generateHr(doc, invoiceTableTop + 20);
}

function generateHr(doc, y) {
  doc
    .strokeColor("#aaaaaa")
    .lineWidth(1)
    .moveTo(50, y)
    .lineTo(560, y)
    .stroke();
}

function formatCurrency(cents) {
  return /* "$" + */ (cents).toFixed(2);
}

function generateTableRow(doc, y, c1, c2, c3, c4, c5, c6, c7, c8) {
	doc.fontSize(10)
		.text(c1, 50, y)
		.text(c2, 110, y,{width: 90, align: 'left'})
    .text(c3, 130, y,{width: 90, align: 'right'})
		.text(c4, 200, y, { width: 90, align: 'right' })
		.text(c5, 270, y, { width: 90, align: 'right' })
    .text(c6, 350, y, { width: 90, align: 'right' })
    .text(c7, 460, y, { width: 90, align: 'left' })
		.text(c8, 500, y, { align: 'right' });
}

const generateExcel = (salesData,filter) => {

  const order_data = salesData.filtered

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  worksheet.columns = [
    { header: 'Date/Time', key: 'date', width: 10 },
    { header: 'Customer', key: 'customer', width: 20 },
    { header: 'Products', key: 'products', width: 10 },
    { header: 'Tax', key: 'tax', width: 10 },
    { header: 'Discounts', key: 'discounts', width: 10 },
    { header: 'Total', key: 'total', width: 10 },
    { header: 'Payment', key: 'payment', width: 10},
    { header: 'Status', key: 'status', width: 10 },
  ];

  // formating
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true }; 
    cell.alignment = { vertical: 'middle' }; 
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' }, 
    };
  });

  order_data.forEach((sale) => {
    worksheet.addRow({
      date: sale.date,
      customer: sale.customer,
      products: sale.quantity,
      tax: sale.tax,
      discounts: sale.discounts,
      total: sale.order_total,
      payment: sale.payment_method,
      status: sale.order_status,
    });
  });

  // ₹ symbol not supported

  worksheet.addRow({
    date: "",
    customer: "",
    products: "",
    tax: "",
    discounts: "",
    total: "",
    payment: "",
    status: "",
  })

  const summery = salesData.total[0]
  
  worksheet.addRow({
    date: 'Totals:',
    customer: "",
    products: summery.sold_items,
    tax: summery.tax,
    discounts: summery.discounts,
    total: summery.revenue,
  })

  const lastRow = worksheet.lastRow;
  lastRow.eachCell((cell) => {
    cell.font = { bold: true };
  });

  return workbook;
};

exports.downloadEXCEL = async (req, res) => {
  let filters = req.query
  const report = await getSalesReport(filters,null);

  const workbook = generateExcel(report,req.query);

  res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await workbook.xlsx.write(res);
  res.end();
};
