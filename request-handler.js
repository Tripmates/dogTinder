var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var petFinderFetch = require('./utils/petfinderHelper');
var request = require('request');
var passport = require('./utils/fbPassportHelper');
var session = require('express-session');
var dbUtils = require('./db/dbUtils');
var Cookies = require('universal-cookie');
var _ = require('./utils/lodash.min.js');
// todo: fix gCloudAPI so it works in external file instead of in request-handler
// var imageRecognition = require('./utils/googleCloudVisionHelper');

// gCloudVisionAPI
const Vision = require('@google-cloud/vision');
const projectId = process.env.GOOGLE_CLOUD_VISION_PROJECT_ID;

const visionClient = Vision({
  projectId: projectId
});


// var RedisStore = require('connect-redis')(session);
var app = express();

app.use(express.static('./public'));
app.use(bodyParser.json());
// app.use(cookieParser(process.env.SESSION_SECRET))

app.use(session({
  secret: process.env.SESSION_SECRET,
  saveUninitialized: true,
  resave: true,
  name: 'dogbiscuit'
}));

// set up passport for FB Auth on Express

app.use(session({ secret: process.env.SESSION_SECRET, saveUninitialized: true, resave: true, name: 'dogbiscuit' }));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (request, response) => {
  if(request.session.user) {
    response.cookie('loggedIn', true, { path: '/' });
    console.log(request.session.user.displayName + ' is logged in with FB ID: ' + request.session.user.id)
  }
  response.sendFile(path.resolve(__dirname, "./public/_index.html"));
});

// signup/login
app.get('/auth/facebook',
  passport.authenticate('facebook', { successRedirect: '/', failureRedirect: '/login'}));

app.get('/login', (req, res) => {
  res.sendFile(path.resolve(__dirname, './public/login.html'));
});

app.get('/auth/facebook/callback',

  passport.authenticate('facebook', { failureRedirect: '/login' }), (req, res) => {

  req.session.user = req.user;

  const cookies = new Cookies(req.headers.cookie);
  var userAnimalList = cookies.get('animalList');

  //ADD ANIMALS FROM COOKIE LIST TO DATABASE
  if (userAnimalList) {
    let animalObjArr = userAnimalList.map((id) => {
      if (id > 100000) {
        return {petFinderid: id.toString()}
      } else {
        return {id: id}
      }
    });

    let facebookID = req.user.id;

    dbUtils.doesUserHaveList(facebookID, (bool) => {
      if (bool) {
        dbUtils.updateUserList({facebookID: facebookID}, animalObjArr, () => {
          res.redirect('/');
        })
      } else {
        dbUtils.saveUserList([null, null, facebookID], animalObjArr, () => {
          res.redirect('/');
        })
      }
    });
  } else {
    res.redirect('/');
  }
});

app.get('/dog-tinder-api/list', (req, res) => {
  if (req.user) {
    let facebookID = req.user.id;

    dbUtils.fetchUserAnimals({facebookID: facebookID}, (results) => {
      let dogIds = [];
      let dogs = [];

      results.forEach((dog) => {
        if (dog.petFinderid) {
          dogIds.push(dog.petFinderid)
        } else {
          dogs.push(dog.id);
        }
      });


      petFinderFetch.getList(dogIds, (pfDogs) => {
        let petfinderDogs = pfDogs
        dbUtils.fetchDogsFromDatabase(dogs, (databaseResults) => {
          let dogs = petfinderDogs.concat(databaseResults);
          res.send(dogs)
        })
      })
    })
  } else {
    const cookies = new Cookies(req.headers.cookie);
    var userAnimalList = cookies.get('animalList');
    // res.clearCookie('loggedIn');

    if (userAnimalList) {
      let petFinderDogs = [];
      let dogTinderDogs = [];

      userAnimalList.forEach((dogId) => {

        if (dogId > 100000) {
          petFinderDogs.push(dogId);
        } else {
          dogTinderDogs.push({id: dogId});
        }
      });


      petFinderFetch.getList(petFinderDogs, function(results) {
        petFinderDogs = results;
        dbUtils.fetchDogsFromDatabase(dogTinderDogs, (databaseResults) => {
          let userDogs = petFinderDogs.concat(databaseResults);
          res.send(userDogs);
        })
      });
    } else {
      res.send([]);
    }
  }

});

app.post('/dog-tinder-api/list', (req, res) => {
  // this route gets an array of dogs from the user's dog-list
  // check to see if logged in
  if (req.user) {
    // make animalObjArr
    let animalObjArr = req.body.map((id) => {
      id = parseInt(id);
      if (id > 100000) {
        return {petFinderid: id.toString()}
      } else {
        return {id: id}
      }
    });

    let facebookID = req.user.id;

    dbUtils.doesUserHaveList(facebookID, (bool) => {
      if (bool) {
        dbUtils.updateUserList({facebookID: facebookID}, animalObjArr, () => {
          res.send(201);
        })
      } else {
        dbUtils.saveUserList([null, null, facebookID], animalObjArr, () => {
          res.send(201);
        })
      }
    })
  } else {
    res.send(201)
  }

});

app.get('/dog-tinder-api', (req, res) => {
  // connect to API and get matching dogs
  if(req.query.location.length !== 5) {
    req.query.location = '07470';
  }

  petFinderFetch.fetchAnimals(req.query, function(animals){
    let zip = req.query.location;
    let query = req.query;
    query.zip = zip;
    delete query.location;

    dbUtils.findDogsFromDatabase(query, (results) => {
      let combinedResults = animals.concat(results);
      res.send(combinedResults);
    })
  })
});

app.delete('/dog-tinder-api/removeAnimal', (req, res) => {
  let facebookID = req.user.id;
  let dogId = req.body.id['$t'];

  if (typeof dogId === 'string') {
    dbUtils.removePetFinderAnimalFromUsersList(facebookID, dogId, () => {
    })
  } else {
    dbUtils.removeDogTinderAnimalFromUsersList(facebookID, dogId, () => {
    })
  }
});

app.get('/gCloudVision', (req,res) => {
  var matches = [];
  visionClient.detectLabels(req.query.imageURL)
    .then((results) => {
      const labels = results[0];

      console.log('Labels:');
      labels.forEach(label => {
        console.log(label);
        matches.push(label);
      });
      res.send(matches);
    })
    .catch((err) => {
      console.error('Error posting to Google Cloud Vision:', err);
    });
})

app.get('/logout', (req, res) => {
  req.session.destroy(function (err) {
    res.clearCookie('loggedIn');
    res.redirect('/');
    if(err) {
      res.send(err);
    }
  });
})

app.post('/dog-tinder-api/dog', (req, res) => {
  dogObj = req.body.data
  dbUtils.addDogToDatabase(dogObj, () => {})
  res.send(201);
})


module.exports = app;
