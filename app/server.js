require('dotenv').config();
const express = require('express');
const hbs = require('hbs');
const app = express();
const session = require('express-session');
const nocache = require('nocache');
const cors = require('cors');
const passport = require('./db/passport')
const path = require('path');
const _PORT = process.env.PORT;

const hbs_helpers = require('./helpers/hbs_helpers')
hbs.registerHelper(hbs_helpers);

hbs.registerPartials(__dirname + '/views/partials')

const userRoutes = require('./routes/userRoutes')
const adminRoutes = require('./routes/adminRoutes')
const connectDB = require('./db/conncetDB');


connectDB()
app.use(nocache())
app.use(cors())
app.set('view engine','hbs')
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:true,
  cookie:{
    secure:false,
    httpOnly:true,
    maxAge:72*60*60*1000
  }
}))

app.use(passport.initialize())
app.use(passport.session())

app.use('/',userRoutes)
app.use('/admin',adminRoutes);

app.listen(_PORT, ()=> {
  console.log(`Server Started on port : ${_PORT}`);
})