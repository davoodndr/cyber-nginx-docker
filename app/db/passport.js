require('dotenv').config()
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20')
const User = require('../models/userModel')

passport.use(new GoogleStrategy({
  clientID:process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  `/google/callback`,//`http://cyber-ecom.shop/google/callback` || `https://cyber-ecom.shop/google/callback`
  proxy:true
},
  async (accessToken,refreshToken,profile,done) => {
    let user = await User.findOne({googleId:profile.id});
    if(user){
      return done(null, user)
    }else{
      const mail = profile.emails[0].value;
      const existUser = await User.findOne({email:mail})
      if(existUser) {
        const updatedUser = await User.findOneAndUpdate({email:mail},{
          $set:{
            username: profile.displayName,
            email: mail,
            password: existUser.password,
            googleId: profile.id,
            user_status: existUser.user_status || 'active'
          }
        })
        return done(null, updatedUser)
      }else{
        user = new User({
          username: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          user_status: 'active'
        })
        await user.save().then(() => {
          return done(null, user)
        })
        .catch(err => {
          console.log('Error in passport',err)
          return done(null,err)
        })
      }
    }
  }

))


passport.serializeUser((user, done) =>{
  done(null,user.id)
})

passport.deserializeUser((id,done) => {
  User.findById(id)
  .then(user => {
    done(null,user)
  })
  .catch(err => {
    console.log('error in deserialize',err)
    done(err, null)
  })
})

module.exports = passport