const fn = require("../helpers/functions");
const PDFDocument = require("pdfkit");

async function createInvoice(invoice) {
  
  return new Promise((resolve,reject) => {
    let doc = new PDFDocument({ size: "A4", margin: 50 });
    const buffer = [];
    doc.on('data', chunk => buffer.push(chunk));

    doc.on('end', () => {
      const pdfData = Buffer.concat(buffer);
      resolve(pdfData);
    });

    doc.on('error', (err) => {
      reject(err);
    });

    generateHeader(doc);
    generateCustomerInformation(doc, invoice);
    generateInvoiceTable(doc, invoice);
    generateFooter(doc);

    doc.end();
  })
  //doc.pipe(fs.createWriteStream(path));
}

function generateHeader(doc) {
  doc.image('public/admin/images/icons/logo.png', 50, 45, { width: 70 })
		.fillColor('#444444')
		.fontSize(12)
		.text('E-commerce', 50, 70)
    .fontSize(10)
		.text('Park Avenue', 200, 55, { align: 'right' })
		.text('Calicut, India, 676001', 200, 70, { align: 'right' })
		.moveDown();
}

function generateCustomerInformation(doc, invoice) {
  doc
    .fillColor("#444444")
    .fontSize(20)
    .text("Invoice", 50, 160);

  generateHr(doc, 185);

  const customerInformationTop = 200;

  doc.registerFont('Rupee','public/admin/fonts/Rupee_Foradian.ttf')
  
  doc
    .fontSize(10)
    .text("Invoice Number:", 50, customerInformationTop)
    .font("Helvetica-Bold")
    .text('#'+fn.generateUniqueId(), 150, customerInformationTop)
    .font("Helvetica")
    .text("Invoice Date:", 50, customerInformationTop + 15)
    .text(formatDate(new Date()), 150, customerInformationTop + 15)
    .text("Total Payable:", 50, customerInformationTop + 30)
    .font('Rupee')
    .text(
      formatCurrency(invoice.order_total),
      150,
      customerInformationTop + 30
    )

    .font("Helvetica-Bold")
    .text(invoice.shipping_address.fullname.toUpperCase(), 300, customerInformationTop)
    .font("Helvetica")
    .text(invoice.shipping_address.address, 300, customerInformationTop + 15)
    .text(
      invoice.shipping_address.city +
        ", " +
        invoice.shipping_address.state +
        ", " +
        invoice.shipping_address.country,
      300,
      customerInformationTop + 30
    )
    .moveDown();

  generateHr(doc, 252);
}

function generateInvoiceTable(doc, invoice) {
  let i;
  const invoiceTableTop = 330;

  doc.font("Helvetica-Bold");
  generateTableRow(
    doc,
    invoiceTableTop,
    "SL",
    "Items",
    "Unit Cost",
    "Quantity",
    "Line Total"
  );
  generateHr(doc, invoiceTableTop + 20);
  doc.font("Helvetica");

  for (i = 0; i < invoice.cart.length; i++) {
    const item = invoice.cart[i];
    const position = invoiceTableTop + (i + 1) * 30;
    generateTableRow(
      doc,
      position,
      i+1,
      item.product_name,
      formatCurrency(item.price),
      item.quantity,
      formatCurrency(item.item_total)
    );

    generateHr(doc, position + 20);
  }

  const subtotalPosition = invoiceTableTop + (i + 1) * 30;
  generateTableRow(
    doc,
    subtotalPosition,
    "",
    "",
    "Subtotal",
    "",
    formatCurrency(invoice.order_subtotal)
  );

  const taxPosition = subtotalPosition + 20;
  generateTableRow(
    doc,
    taxPosition,
    "",
    "",
    "Tax",
    "",
    formatCurrency(invoice.tax)
  );

  const discountPosition = taxPosition + 20;
  generateTableRow(
    doc,
    discountPosition,
    "",
    "",
    "Discounts",
    "",
    '-'+formatCurrency(invoice.discounts)
  );

  const duePosition = discountPosition + 25;
  doc.font("Helvetica-Bold");
  generateTableRow(
    doc,
    duePosition,
    "",
    "",
    "Total",
    "",
    formatCurrency(invoice.order_total)
  );
  doc.font("Helvetica");
}

function generateFooter(doc) {
  doc
    .fontSize(10)
    .text(
      "Payment is due within 15 days. Thank you for your business.",
      50,
      780,
      { align: "center", width: 500 }
    );
}

function generateTableRow(
  doc,
  y,
  SL,
  product,
  unitCost,
  quantity,
  lineTotal
) {
  doc
    .fontSize(10)
    .text(SL, 50, y)
    .text(product, 80, y)
    .text(unitCost, 280, y, { width: 90, align: "right" })
    .text(quantity, 370, y, { width: 90, align: "right" })
    .text(lineTotal, 0, y, { align: "right" });
}

function generateHr(doc, y) {
  doc
    .strokeColor("#aaaaaa")
    .lineWidth(1)
    .moveTo(50, y)
    .lineTo(550, y)
    .stroke();
}

function formatCurrency(cents) {
  return /* '₹' + */ (cents).toFixed(2);
}

function formatDate(date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return year + "-" + month + "-" + day;
}

module.exports = {
  createInvoice
};



// implimentation

/* const { createInvoice } = require("./createInvoice.js");

const invoice = {
  shipping: {
    name: "John Doe",
    address: "1234 Main Street",
    city: "San Francisco",
    state: "CA",
    country: "US",
    postal_code: 94111
  },
  items: [
    {
      item: "TC 100",
      description: "Toner Cartridge",
      quantity: 2,
      amount: 6000
    },
    {
      item: "USB_EXT",
      description: "USB Cable Extender",
      quantity: 1,
      amount: 2000
    }
  ],
  subtotal: 8000,
  paid: 0,
  invoice_nr: 1234
};

createInvoice(invoice, "invoice.pdf"); */