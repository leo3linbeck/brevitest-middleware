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

function square(a) {
	return a * a;
}

function rgbDiff(r1, r2) {
	return Math.sqrt(square(r1.red / r1.clear - r2.red / r2.clear) + square(r1.blue / r1.clear - r2.blue / r2.clear) + square(r1.green / r1.clear - r2.green / r2.clear));
}

function calculateResults(data) {
	if (data.length !== 4) {
		return 'Error';
	}
	if (!data[0].clear) {
		return 'None';
	}

	return Math.round(100000 * (rgbDiff(data[1], data[3]) - rgbDiff(data[0], data[2])), 0);
};

function calculate_test_results(context, tests) {
	var count = 0;
	if (tests.length > 0) {
		tests.forEach(function(test) {
			getDocument(context, test.id)
				.then(function(test_doc) {
					if (test_doc && (!test_doc.readout || !test_doc.result)) {
						if (test_doc.rawData && test_doc.rawData.readings) {
				            test_doc.readout = calculateResults(test_doc.rawData.readings);
							if (typeof test_doc.readout !== 'number') {
								test_doc.result = 'Unknown';
							}
				            else if (test_doc.readout > test_doc.assay.standardCurve.cutScores.redMax || test_doc.readout < test_doc.assay.standardCurve.cutScores.redMin) {
				                test_doc.result = 'Positive';
				            }
				            else if (test_doc.readout > test_doc.assay.standardCurve.cutScores.greenMax || test_doc.readout < test_doc.assay.standardCurve.cutScores.greenMin) {
				                test_doc.result = 'Borderline';
				            }
				            else {
				                test_doc.result = 'Negative';
				            }

							count += 1;
							saveDocument(context, test_doc)
								.then(function(r) {console.log('test_doc - good', count++, r.ok, test_doc._id, test_doc.readout, test_doc.result);});
						}
						else {
							test_doc.readout = 'No Data';
							test_doc.result = 'Unknown';
							count += 1;
							saveDocument(context, test_doc)
								.then(function(r) {console.log('test_doc - bad', count++, r.ok, test_doc._id, test_doc.readout, test_doc.result);});
						}
					}
				});
		});
	}
	else {
		return [];
	}
}

function fix_completed_tests(context) {
	return findDocuments(context, 'tests', 'complete_needs_calc')
		.then(function(completed_tests) {
			return calculate_test_results(context, completed_tests.rows);
		});
}

module.exports =
	function (context, cb) {
		fix_completed_tests(context)
			.then(function() {
				cb(null, 'Repair job complete');
			})
			.catch(function(e) {
				cb(e);
			});
	};
