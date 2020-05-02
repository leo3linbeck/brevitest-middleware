var rp = require('request-promise');

function getDocument(context, docId) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/' + docId,
		method: 'GET',
		auth: {
			username: context.secrets.USERNAME,
			password: context.secrets.PASSWORD
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
			username: context.secrets.USERNAME,
			password: context.secrets.PASSWORD
		},
        json: true,
        body: doc
	};
	return rp(options);
}

module.exports =
	function (context, cb) {
        var cartridgeId;
		var testId = context.data.data;

		console.log('webtask_brevitest_test_completed');

		if (!testId) {
			cb(null, 'FAILURENo test id found');
		}
		else {
			getDocument(context, testId)
	            .then(function(test) {
					if (!test) {
						throw new Error ('FAILURETest not found');
					}
					if (!test.cartridge) {
						throw new Error ('FAILURETest cartridge not found');
					}
					if (!test.cartridge._id) {
						throw new Error ('FAILURETest cartridge ID not found');
					}

					test.status = 'Awaiting results';
	                test.finishedOn = new Date();

					console.log('completed test', test);
	                return saveDocument(context, test);
	            })
	            .then(function(response) {
	                console.log(response);
					if (!response || !response.ok) {
						throw new Error ('FAILURETest not saved');
					}
					cb(null, 'SUCCESS');
	            })
	            .catch(function(error) {
	                console.log(error);
					if (error.message && error.message.slice(0,7) === 'FAILURE') {
						cb(null, error.message);
					}
					else {
						cb(error);
					}
	            })
		}
	};
