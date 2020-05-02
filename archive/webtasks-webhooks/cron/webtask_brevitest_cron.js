var rp = require('request-promise-native');

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

function loadDocuments(context, docIdArray) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/_all_docs?include_docs=true',
		method: 'POST',
		auth: {
			username: context.secrets.COUCHDB_USERNAME,
			password: context.secrets.COUCHDB_PASSWORD
		},
		body: {
		  keys: docIdArray
		},
    	json: true
	};
	return rp(options);
}

function findDocuments(context, designDoc, viewName) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/_design/' + designDoc + '/_view/' + viewName,
		method: 'GET',
		auth: {
			username: context.secrets.COUCHDB_USERNAME,
			password: context.secrets.COUCHDB_PASSWORD
		},
    	json: true
	};
	return rp(options);
}

function change_status_to_cancel(context, tests) {
	if (tests.length > 0) {
		var chunk = tests.slice(0, 100);
		var promises = chunk.map(function(test) {
							return getDocument(context, test.id)
								.then(function(test_doc) {
									if (typeof test_doc.startedOn === 'undefined') {
										test_doc.status = 'Unknown';
										return saveDocument(context, test_doc);
									}
									var start = new Date(test_doc.startedOn).getTime();
									var an_hour_ago = new Date() - 3600000;
									if (start < an_hour_ago) {
										test_doc.status = 'Cancelled';
										return saveDocument(context, test_doc);
									}
									return test_doc;
								});
						});
		return Promise.all(promises);
	}
	else {
		return [];
	}
}

function cancel_abandoned_in_progres_tests(context) {
	return findDocuments(context, 'tests', 'in_progress')
		.then(function(tests_in_progress) {
			return change_status_to_cancel(context, tests_in_progress.rows);
		})
		.then(function(results) {
			console.log(results.filter(function(r) {return r.ok;}).length + ' tests changed from in progress to cancelled');
		});
}

function cancel_abandoned_in_queue_tests(context) {
	return findDocuments(context, 'tests', 'in_queue')
		.then(function(tests_in_queue) {
			return change_status_to_cancel(context, tests_in_queue.rows);
		})
		.then(function(results) {
			console.log(results.filter(function(r) {return r.ok;}).length + ' tests changed from in queue to cancelled');
		});
}

module.exports =
	function (context, cb) {
		cancel_abandoned_in_progres_tests(context)
			.then(function() {
				return cancel_abandoned_in_queue_tests(context);
			})
			.then(function() {
				cb(null, 'Cron job complete');
			})
			.catch(function(e) {
				cb(e);
			});
	};
