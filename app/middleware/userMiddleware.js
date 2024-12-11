/* const checkSession = (req,res,next) => {
  if(req.session.user){
    next()
  }else{
    res.redirect('/')
  }
} */

const checkAccess = (req,res,next) => {
  const user = req.session.user;
  if(user && !user.isBlocked){
    next()
  }else{
    res.redirect('/login')
  }
}

const isLogin = (req,res,next) => {
  const user = req.session.user;
  if(user && !user.isBlocked){
    res.redirect('/')
  }else{
    next()
  }
}


module.exports = {
  /* checkSession, */
  checkAccess,
  isLogin
}