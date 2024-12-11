const moment = require('moment');

module.exports = {
  formatDate: function (date, format) {
    return moment.parseZone(date).format(`${format}`);
  },
  subtract: function (a, b) {
    return a - b;
  },
  add: function (a, b) {
    return a + b;
  },
  eq: function (a, b) {
    return a === b;
  },
  neq: function(a,b){
    return a !== b;
  },
  gt: function (a, b) {
    return a > b;
  },
  lt: function (a, b) {
    return a < b;
  },
  range: function (min, max) {
    return Array.from({ length: (max - min + 1) }, (_, i) => i + min);
  },
  json: function(context){
    return JSON.stringify(context)
  },
  length: function(array){
    return array ? array.length : 0
  },
  remember: function(previous, original){
    return previous ? previous : original;
  },
  select: function(value, comparer){
    return value == comparer ? 'selected' : ''
  },
  check: function(value, comparer){
    return value == comparer ? 'checked' : ''
  },
  limit: function(array, limit){
    return array.slice(0,limit)
  },
  isPairValid: function(el1, el2){
    if(el1.length && !el2.length) return false
    if(!el1.length && el2.length) return false
    return true
  },
  listFromLength: function(length){
    return Array.from({ length }, (_, i) => i + 1);
  },
  or: function (...conditions) {
    const options = conditions.pop();

    for (let arg of conditions) {
      if (arg) {
        return true;
      }
    }
    return false;
  },
  and: function(...conditions){
    //return conditions.every(Boolean);
    const options = conditions.pop();

    for (let arg of conditions) {
      if (!arg) {
        return false;
      }
    }
    return true;
  },
  arrayMatch: function(array, search, value1, value2){
    if (!Array.isArray(array) || array.length === 0) {
      return value2;
    }
    const find = array.filter(item => item.toString() === search.toString());
    return find.toString() === search.toString() ? value1 : value2
  },
  json2query: function(json){
    return new URLSearchParams(json).toString()
  },
  isArray: function(input){
    return Array.isArray(input)
  },
  keyValue: function(object,returns, defaultVal){
    if(object && Object.entries(object).flat().length > 0){
      return returns === 'key' ? Object.keys(object)[0] : Object.values(object)[0]
    }else{
      return defaultVal
    }
  },
  isEmptyObject: function(value, options) {
    if (value && typeof value === 'object' && Object.keys(value).length === 0) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  },
  log: function(input){
    console.log(input)
  }
  
}