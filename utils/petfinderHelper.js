const request = require('request');
var qs = require('querystring');
var _ = require('./lodash.min.js');

let querystring = {
  key: process.env.PET_API_KEY,
  format: 'json',
  animal: 'dog',
  count: 50
}

function removeSmallPicsFromOneDog(dog) {
  dog = JSON.parse(dog);
  if(dog.petfinder.pets) {
    dog = dog.petfinder.pets.pet;
  } else {
    dog = dog.petfinder.pet
  }

  var modifyPhotos = function(photoArray){
    var newPhotos = [];
    for(var i = 0; i < photoArray.length; i++){
      if (photoArray[i]['@size'] === 'x'){
        newPhotos.push(photoArray[i].$t);
      }
    }
    return newPhotos;
  }
  if(dog.media.photos) {
    dog.media.photos.photo = modifyPhotos(dog.media.photos.photo);
    return dog;
  } else {
    return;
  }
}

function removeSmallPics(resultArray) {
  resultArray = JSON.parse(resultArray);
  var animals = resultArray.petfinder.pets.pet;
  var filteredAnimals = [];
  var modifyPhotos = function(photoArray){
    var newPhotos = [];
    for(var i = 0; i < photoArray.length; i++){
      if (photoArray[i]['@size'] === 'x'){
        newPhotos.push(photoArray[i].$t);
      }
    }
    return newPhotos;
  }
  // if the response from Petfinder is an array of animals
  if(Array.isArray(animals)){
    animals.forEach(function(animal){
      if(animal.media.photos) {
        animal.media.photos.photo = modifyPhotos(animal.media.photos.photo);
        filteredAnimals.push(animal);
      }
    })
    return filteredAnimals;
  } else {
    // we only got one animal object from Petfinder

    return [removeSmallPicsFromOneDog(JSON.stringify(resultArray))];
  }

}

exports.fetchAnimals = (params, callback) => {
  let querystring = {
    key: process.env.PET_API_KEY,
    format: 'json',
    animal: 'dog', // default initial results to dogs
    count: 50
  }

  for(var key in params){
    querystring[key] = params[key]
  }
  request({
    method: 'get',
    url: 'http://api.petfinder.com/pet.find',
    qs: querystring
  }, function(error, response, body){

    if(JSON.parse(body).petfinder.header.status.code.$t !== "100") {
      callback([]);
    } else {
      let petArray = JSON.parse(body).petfinder.pets;
      // if the petArray has no pets:
      // pet list comes back here - successfully
      // console.log("Object.keys(petArray)", petArray["pet"]);

      if (Object.keys(petArray).length === 0 && petArray.constructor === Object) {
        callback([]);
      } else {

        body = removeSmallPics(body);
        callback(body);
      }
    }
  })
}

exports.getList = (list, callback) => {

  function getRecursive(listSoFar, results) {
    if(listSoFar.length === 0) {
      results.forEach(animal => animal.description.$t = _.replace(animal.description.$t, /â/g, '&#39;'));
      callback(results);
      return;
    }
    querystring.id = listSoFar[0];
    if (querystring.id.length < 7) {
      listSoFar.shift();
      return getRecursive(listSoFar, results);
    } else {
      listSoFar.shift();
      request({
        method: 'get',
        url: 'http://api.petfinder.com/pet.get',
        qs: querystring
      }, function(error, response, body){
        if(error) {
          console.log(error);
        } else {
          if(JSON.parse(body).petfinder.header.status.code.$t === '100') {
            results.push(removeSmallPicsFromOneDog(body));
            return getRecursive(listSoFar, results);
          } else {
            return getRecursive(listSoFar, results);
          }
        };
      });
    }
  }
  var emptyArr = [];
  getRecursive(list, emptyArr);

}
