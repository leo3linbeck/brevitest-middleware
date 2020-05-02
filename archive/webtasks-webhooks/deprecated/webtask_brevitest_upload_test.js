var rp = require('request-promise');
var Particle = require('particle-api-js');
var particle = new Particle();

function login(context) {
	return particle.login({
		username: context.secrets.PARTICLE_USERNAME,
		password: context.secrets.PARTICLE_PASSWORD
	});
}

function getTestData(deviceId, token) {
	return particle.getVariable({
		deviceId: deviceId,
		name: 'register',
		auth: token
	})
}

function getDocument(context, docId) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/' + docId,
		method: 'GET',
		auth: {
			username: context.secrets.COUCHDB_USERNAME,
			password: context.secrets.COUCHDB_PASSWORD
		},
        json: true
	};
	return rp(options);
}

function saveDocument(context, doc) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/' + doc._id,
		method: 'PUT',
		auth: {
			username: context.secrets.COUCHDB_USERNAME,
			password: context.secrets.COUCHDB_PASSWORD
		},
        json: true,
        body: doc
	};
	return rp(options);
}

function parseReading(line) {
	var attr = line.split('\t');
	return {
		channel: attr[0],
		time: Date(parseInt(attr[1])),
		red_mean: parseInt(attr[2]),
		green_mean: parseInt(attr[3]),
		blue_mean: parseInt(attr[4]),
		clear_mean: parseInt(attr[5]),
		clear_max: parseInt(attr[6]),
		clear_min: parseInt(attr[7])
	}
}

function parseData(str, testId) {
    var attr, i, lines;
    var result = {};

	lines = str.split('\n');
    attr = lines[0].split('\t');
    result.startedOn = Date(parseInt(attr[0]));
    result.finishedOn = Date(parseInt(attr[1]));
	result.testId = attr[2];
	result.number_of_readings = lines.length - 2;
	result.readings = [];
	for (i = 0; i < result.number_of_readings; i += 1) {
		result.readings.push(parseReading(lines[i + 1]));
	}
    return result;
}

module.exports =
  function(context, cb) {
      var token, result;
	  var deviceId = context.data.coreid;
	  var testId = context.data.data;

	  console.log('webtask_brevitest_upload_test');

	  if (!deviceId) {
		  cb(null, 'FAILUREDevice ID not found');
	  }
	  else if (!testId) {
		  cb(null, 'FAILURETest ID not found');
	  }
	  else {
		  login(context)
		  	.then(function(response) {
				token = response.body.access_token;
				return getTestData(deviceId, token);
			})
			.then(function(response) {
				if (!response || !response.body || !response.body.result) {
				  throw new Error('FAILUREUnable to get test data from device');
				}
				result = parseData(response.body.result, testId);
				if (result.testId !== testId) {
				  throw new Error('FAILURETest ID in device does not match test ID requested');
				}
				delete result.testId;
		        return getDocument(context, testId)
			})
			.then(function(test) {
				if (!test) {
				  throw new Error('FAILURETest not found');
				}
				test.rawData = result;
				test.status = 'Complete';
				console.log(test);
				return saveDocument(context, test);
			})
			.then(function(response) {
				if (!response || !response.ok) {
				  throw new Error('FAILURETest not saved');
				}
				cb(null, 'SUCCESS' + testId);
			})
			.catch(function(error) {
				if (error.message && error.message.slice(0,7) === 'FAILURE') {
					cb(null, error.message);
				}
				else {
					cb(error);
				}
			});
	  }
};
