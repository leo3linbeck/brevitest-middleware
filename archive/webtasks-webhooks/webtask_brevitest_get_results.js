var rp = require('request-promise');
var _ = require('lodash');

function generateResult(context, ids, range) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/_all_docs?include_docs=true',
		auth: {
			username: context.secrets.USERNAME,
			password: context.secrets.PASSWORD
		},
        json: true
	};
	if (range) {	// start and end key
		options.method = 'GET';
		options.uri += encodeURI('&startkey="' + ids[0] + '000"&endkey="' + ids[1] + 'FFF"');
	}
	else {	// list of keys
		options.method = 'POST';
		options.body = { keys: ids };
	}
    return rp(options);
}

module.exports =
	function (context, cb) {
		var data, ids, result = [], range = false;

		if (context && context.data) {
			data = context.body_raw;
			range = data.indexOf('-') !== -1;
			if (range) {
				ids = data.split('-');
			}
			else {
				ids = data.split(',');
			}
			generateResult(context, ids, range)
				.then(function(response) {
					result.push('test_id|cartridge_id|device_name|reading_number|channel|time|red_mean|green_mean|blue_mean|clear_mean|clear_max|clear_min');
					response.rows.forEach(function(e) {
						if (e.doc && e.doc.rawData && e.doc.rawData.readings) {
							e.doc.rawData.readings.forEach(function(r, i) {
								if (r.channel && r.time && r.red_mean) {
									result.push(
											e.id + '|' +
											e.doc.cartridge._id + '|' +
											e.doc.device.name + '|' +
											(Math.floor(i / 2) + 1).toString() + '|' +
											r.channel + '|' +
											new Date(r.time).getTime() + '|' +
											r.red_mean + '|' +
											r.green_mean + '|' +
											r.blue_mean + '|' +
											r.clear_mean + '|' +
											r.clear_max + '|' +
											r.clear_min
										);
								}
							});
						}
					});
					console.log(result);
					cb(null, result);
				})
				.catch(function(error) {
					console.log('error', error);
					cb(error);
				})
		}
		else {
			console.log('context', context);
			cb(context);
		}
	};
