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
        var cartridgeId, device;
		var testId = context.data.data;

		console.log('webtask_brevitest_test_started');
		console.log(context.data);
		if (!context.data.coreid) {
			cb(null, 'FAILURENo device id found');
		}

		getDocument(context, context.data.coreid)
			.then(function(d) {
				if (!d) {
					throw new Error ('FAILUREDevice not found');
				}
				device = d;

				if (!testId) {
					throw new Error('FAILURENo test id found');
				}
				return getDocument(context, testId);
			})
            .then(function(test) {
				if (!test) {
					throw new Error ('FAILURETest not found');
				}
				else if (!test.cartridge) {
					throw new Error ('FAILURETest cartridge not found');
				}
				else if (!test.cartridge._id) {
					throw new Error ('FAILURETest cartridge ID not found');
				}

				test.device = device;
                test.status = 'In progress';
                test.startedOn = new Date();
                cartridgeId = test.cartridge._id;
                return saveDocument(context, test);
            })
            .then(function(response) {
                console.log(response);
				if (!response || !response.ok) {
					throw new Error ('FAILURETest not saved');
				}
                return getDocument(context, cartridgeId);
            })
            .then(function(cartridge) {
				if (!cartridge) {
					throw new Error ('FAILURECartridge not found');
				}
                cartridge.used = true;
                return saveDocument(context, cartridge);
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
	};
