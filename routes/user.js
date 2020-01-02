// Handle authentication of users
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require('config');
const User = require("../models/User");
const Url = require("../models/Url");
const querystring = require('querystring'); //Just added to send query
const verify = require('../verifyToken');
const MT = require('mersenne-twister');
const base = require('base-converter');
const generator = new MT();

const {
  registerValidation,
  loginValidation
} = require("../validation");

//Checks whitespaces in username (even white spaces like tab)
function hasWhiteSpace(s) {
  return /\s/g.test(s);
}

//Since no session we are not using redirectLogin so need to find different way to redirect back to loginpage in case of user not found.
// Login middleware
/* const redirectLogin = (req, res, next) => {
  if(!req.session.userId) {
    console.log(req.session.userId);
    res.redirect('/api/user/loginpage'); //redirecting becomes easier if we change name from login to loginpage
  } else {
    next();
  }
}
 */

// @route   POST /api/user/register
// @desc    Register user
router.post("/register", async (req, res) => {
  // Validate the register data
  const {
    value,
    error
  } = registerValidation(req.body);

  if (error) {
  return res.status(500).send(error.details[0].message);
  }
  // Check if user already exists
  const emailExist = await User.findOne({
    email: req.body.email
  });

  if (emailExist) {
    res.status(400).send("Email already exists");
  }
  
  const nameExist = await User.findOne({
    name: req.body.name
  });
  if (nameExist) {
    res.status(400).send("Username already exists");
  }

  if(hasWhiteSpace(req.body.name)){
    res.status(400).send("Username cannot contain a whitespace");
  }
  // Hash passwords
  const salt = await bcrypt.genSalt();
  const hashedPassword = await bcrypt.hash(req.body.password, salt);

  // Create a new user 
  let user = new User({
    name: req.body.name,
    email: req.body.email,
    password: hashedPassword,
    urls: []
  });

  try {
    await user.save();

    res.send({
      user_id: user._id
    })

  } catch (err) {
    res.status(400).send(err);
  }
});


// @route   POST /api/user/login
// @desc    Login user
router.post("/login", async (req, res) => {
  // Validate the login data
  const {
    value,
    error
  } = loginValidation(req.body);

  if (error) {
    res.status(400).send(error.details[0].message);
  }

  // Check if email exists
  let user = await User.findOne({
    email: req.body.email
  });
  if (!user) {
    res.status(400).send("Email or the password is wrong");
  }
  // Check if password is correct
  const validPass = await bcrypt.compare(req.body.password, user.password);
  if (!validPass) {
    res.status(400).send("Email or the password is wrong");
  }
  // Create and assign a token
  const TOKEN_SECRET = config.get("tokenSecret")
  const token = jwt.sign({_id: user._id}, TOKEN_SECRET);
  res.header("auth-token", token).send(user._id);
});

// @route   GET /api/user/dashboard
// expects 'auth-token' and 'user-id' in header of request
// @desc    Dashboard for the logged in  user ( private route )
router.get('/dashboard', verify, async (req, res) => {
  const user_id = req.header('user_id');
  try {
    let user = await User.findById(user_id);
    res.send(user);
  } catch (err) {
    res.status(500).send("User not found");
  }

})

// @route   POST /api/user/shorten
// expects 'auth-token' and 'user-id' in header of request
// @desc    Api for generating short url from dashboard
router.post('/shorten', verify, async (req, res) => {
  const user_id = req.header('user_id');
  
  try {
    let user = await User.findById(user_id);
    res.send(user);
  } catch (err) {
    res.status(500).send("User not found");
  }

  const longUrl = req.body.longUrl;
  const customCode = req.body.customCode;

  const baseUrl = config.get('baseUrl');

    //function to pad 0s upto 6 digits
    function padDigits (number, digits) {
      return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
    }
    //No two users can have same randomurl since both of them should have different redirectCount and no way to tell if they have same hash
    //Another reason is that the users might generate short url at different time and one user might have generated some redirectCount in that time.  
    if (!customCode) {
      try {
        urlCode = base.decTo62(generator.random_int()); //generating a mersenne-twister random number
        let Code = await Url.findOne({ urlCode });

        //The while block runs until the urlCode generated is unique
        while (Code) {
        urlCode = base.decTo62(generator.random_int()); //generating a mersenne-twister random number
        Code = await Url.findOne({ urlCode });
        }
        const shortUrl = baseUrl + '/' + padDigits(urlCode,6);
  
        url = new Url({
        longUrl,
        shortUrl,
        urlCode,
        redirectCount: 0,
        date: new Date()
        });

        await user.urls.push( url );
        await user.save();
        
        res.status(200).send("Url saved");
      } catch (err) {
        res.status(500).send(err);
      }
    } //The following block runs when customCode is given
    else {
      try {
        let user = await User.findOne({"urls.urlCode": customCode}) // Check if the custom code already exists
        
        if (user){
          //If customCode is already present in the document then we let anyone use it.
          res.status(400).send("That url code is already used. Try another");
      } //The custom url entered is unique and can be used to generate short url.
        else {
          const shortUrl = baseUrl + '/' + customCode;
          const urlCode = customCode;
          url = new Url({
          longUrl,
          shortUrl,
          urlCode,
          redirectCount: 0,
          date: new Date()
          });

          await user.urls.push(url);
          await user.save();

          res.status(200).send("Url saved");
        }
      } catch (err) {
        res.status(500).send(err);
      }
    }
});

router.get('/loginpage',  (req, res) => {
  //Render login page
  res.send("At login");
})

router.get('/registerpage',  (req, res) => {
  //Render register page
  res.send("At register page");
})

router.get('/signout',  (req, res) => {
  //Redirect to home page.
  return res.send("Signed out");
})
module.exports = router;
