var rp = require('request-promise');
var Particle = require('particle-api-js');
var particle = new Particle();
var synaptic = require('synaptic');
var Neuron = synaptic.Neuron,
	Layer = synaptic.Layer,
	Network = synaptic.Network,
	Trainer = synaptic.Trainer,
	Architect = synaptic.Architect;

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
	});
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

var bcodeCommands = [{
	num: '0',
	name: 'Start Test',
	params: [],
	description: 'Starts the test. Required to be the first command. Test executes until Finish Test command.'
}, {
	num: '1',
	name: 'Delay',
	params: ['delay_ms'],
	description: 'Waits for specified number of milliseconds.'
}, {
	num: '2',
	name: 'Move',
	params: ['steps', 'step_delay_us'],
	description: 'Moves the stage a specified number of steps at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '3',
	name: 'Solenoid On',
	params: ['energize_ms'],
	description: 'Energizes the solenoid for a specified number of milliseconds.'
}, {
	num: '4',
	name: 'Device LED On White',
	params: [],
	description: 'Turns on the device LED, which is visible outside the device, full power white.'
}, {
	num: '5',
	name: 'Device LED Off',
	params: [],
	description: 'Turns off the device LED.'
}, {
	num: '6',
	name: 'Device LED On With Color',
	params: ['red', 'green', 'blue'],
	description: 'Turns on the device LED, which is visible outside the device, with the specified RGB values.'
}, {
	num: '7',
	name: 'Sensor LED On',
	params: ['power'],
	description: 'Turns on the sensor LED at a given power.'
}, {
	num: '8',
	name: 'Sensor LED Off',
	params: [],
	description: 'Turns off the sensor LED.'
}, {
	num: '9',
	name: 'Read Sensors',
	params: [],
	description: 'Takes readings from the sensors.'
}, {
	num: '10',
	name: 'Read Sensors With Parameters',
	params: ['led_power', 'integration_time', 'gain'],
	description: 'Read sensors with input parameters.'
}, {
	num: '11',
	name: 'Repeat Uninterrupted',
	params: ['count'],
	description: 'Repeats the block of BCODE without interruption.'
}, {
	num: '12',
	name: 'Repeat',
	params: ['count'],
	description: 'Repeats the block of BCODE.'
}, {
	num: '14',
	name: 'Heat Pulse',
	params: ['duration'],
	description: 'Turns on the cartridge heater for a number of milliseconds.'
}, {
	num: '15',
	name: 'Turn Heat On',
	params: [],
	description: 'Turns on the cartridge heater.'
}, {
	num: '16',
	name: 'Turn Heat Off',
	params: [],
	description: 'Turns off the cartridge heater.'
}, {
	num: '98',
	  name: 'Comment',
	  params: ['text'],
	  description: 'Comment - ignored by system.'
  }, {
	num: '99',
	name: 'Finish Test',
	params: [],
	description: 'Finishes the test. Required to be the final command.'
}];

var deviceParams;

var integrationDelay = {
	0xFF: 2.4,
	/**<  2.4ms - 1 cycle    - Max Count: 1024  */
	0xF6: 24,
	/**<  24ms  - 10 cycles  - Max Count: 10240 */
	0xEB: 50,
	/**<  50ms  - 20 cycles  - Max Count: 20480 */
	0xD5: 101,
	/**<  101ms - 42 cycles  - Max Count: 43008 */
	0xC0: 154,
	/**<  154ms - 64 cycles  - Max Count: 65535 */
	0x00: 700 /**<  700ms - 256 cycles - Max Count: 65535 */
};

function getBcodeCommand(cmd) {
	return bcodeCommands.find(function (e) {
		return e.name === cmd;
	});
}

function instructionTime(command, params) {
	var d = 0;
	// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
	switch (command) {
	case 'Delay': // delay
		d = parseInt(params.delay_ms);
		break;
	case 'Solenoid On': // solenoid on
		d = parseInt(params.energize_ms);
		break;
	case 'Move': // move
		d = Math.floor(Math.abs(parseInt(params.steps)) * parseInt(params.step_delay_us) / 1000);
		break;
	case 'Blink Device LED': // blink device LED
		d = 2 * Math.floor(parseInt(params.blinks) * parseInt(params.period_ms));
		break;
	case 'Read Sensors': // read Sensors
		d = integrationDelay[deviceParams.integrationTime];
		if (typeof d === 'undefined') {
			throw new Error('Unknown integration time code');
		}
		d = deviceParams.delayBetweenSensorReadings + d * 10;
		break;
	case 'Read Sensors With Parameters':
		d = integrationDelay[params.integrationTime];
		if (typeof d === 'undefined') {
			throw new Error('Unknown integration time code parameter');
		}
		d = deviceParams.delayBetweenSensorReadings + d * 10;
		break;
	case 'Heat Pulse':
		d = parseInt(params.duration);
		break;
	case 'Start Test': // starting sensor reading plus LED warmup
		d = 6000;
		break;
	case 'Finish Test': // starting sensor reading plus LED warmup
		d = 6000;
		break;
	}
	// jscs:enable requireCamelCaseOrUpperCaseIdentifiers

	return d;
}

function bcodeEstimatedTime(bcodeArray) {
	var b, i;
	var duration = 0;

	for (i = 0; i < bcodeArray.length; i += 1) {
		b = bcodeArray[i];
		if (b) {
			if (b.command === 'Repeat' || b.command === 'Repeat Uninterrupted') {
				duration += bcodeEstimatedTime(b.code) * parseInt(b.count);
			} else {
				duration += instructionTime(b.command, b.params);
			}
		}
	}

	return duration;
}

function paramString(params, keys) {
	return ',' + keys.map(function (key) {
		return params[key];
	}).join(',');
}

function compileInstruction(cmd, params) {
	var elem = getBcodeCommand(cmd);
	var keys = Object.keys(params);
	if (keys.length !== elem.params.length) {
		throw new Error('Parameter count mismatch, command: ' + cmd + ' should have ' + elem.params.length + ', has ' + keys.length);
	}
	return elem.num + (elem.params.length ? paramString(params, elem.params) : '') + '\t';
}

function compileRepeatUninterruptedBegin(count) {
	return '11,' + count + '\t';
}

function compileRepeatBegin(count) {
	return '12,' + count + '\t';
}

function compileRepeatEnd() {
	return '13\t';
}

function bcodeCompileArray(bcodeArray) {
	var b, i;
	var compiledCode = '';

	for (i = 0; i < bcodeArray.length; i += 1) {
		b = bcodeArray[i];
		if (b) {
			if (b.command !== 'Comment') {
				if (b.command === 'Repeat') {
					compiledCode += compileRepeatBegin(b.count) + bcodeCompileArray(b.code) + compileRepeatEnd();
				} else {
					if (b.command === 'Repeat Uninterrupted') {
						compiledCode += compileRepeatUninterruptedBegin(b.count) + bcodeCompileArray(b.code) + compileRepeatEnd();
					} else {
						compiledCode += compileInstruction(b.command, b.params);
					}
				}
			}
		}
	}

	return compiledCode;
}

function bcodeDuration(bcode) {
	deviceParams = bcode.deviceParams;
	return parseInt(bcodeEstimatedTime(bcode.code) / 1000);
}

function bcodeCompile(bcode) {
	deviceParams = bcode.deviceParams;
	return bcodeCompileArray(bcode.code);
}

function generateTestString(cartridgeId, assay, testId) {
	var code = cartridgeId + '\n';
	var bcode, codeStr;

	code += testId + '\t';

	bcode = assay.BCODE;
	code += assay.duration + '\t';
	code += bcode.deviceParams.integrationTime + '\t';
	code += bcode.deviceParams.gain + '\t';
	code += bcode.deviceParams.ledPower + '\t';
	code += bcode.deviceParams.delayBetweenSensorReadings + '\t';

	codeStr = bcodeCompile(bcode);
	code += (codeStr.length + 1).toString() + '\t';
	code += '1\t'; // BCODE version
	code += codeStr;

	code += '\n';

	return code;
}

function randHexDigits(len) {
    var i, result = '';
    for (i = 0; i < len; i += 1) {
        result += parseInt(Math.random() * 16).toString(16).toUpperCase();
    }
    return result;
}

function createTest(context, cartridge, assay) {
	console.log('Creating new test', cartridge, assay);
	var id = 'brevitst' + Date.now().toString() + randHexDigits(3);
    var test = {
        _id: id,
        schema: 'test',
        cartridge: cartridge,
        assay: assay,
				refNumber: 'Test auto-created by webtask',
        status: 'In queue',
				queuedOn: new Date()
    };

	return saveDocument(context, test)
		.then(function(response) {
			test._rev = response.rev;
			cartridge.testId = id;
			return saveDocument(context, cartridge);
		})
		.then(function(response) {
			cartridge._rev = response.rev;
			return test;
		});
}

function validate_cartridge(context, cb, cartridgeId) {
	var testId = null;
	var cartridge = null;
	var assay = null;

	console.log('webtask_brevitest_validate');

	if (cartridgeId) {
		console.log(cartridgeId);
		getDocument(context, cartridgeId)
			.then(function (c) {
				cartridge = c;
				console.log(cartridge);
				if (!cartridge) {
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge not found');
				}
				if (!cartridge._id) {
					throw new Error('FAILURE\n' + cartridgeId + '\nMissing cartridge ID');
				}
				if (cartridge._id !== cartridgeId) {
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge ID mismatch');
				}
				if (cartridge.used) {
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge already used');
				}

				return getDocument(context, cartridgeId.slice(0, 8));
			})
			.then(function (a) {
				assay = a;
				if (!assay) {
					throw new Error('FAILURE\n' + cartridgeId + '\nAssay not found');
				}
				if (!assay._id) {
					throw new Error('FAILURE\n' + cartridgeId + '\nMissing assay ID');
				}
				if (assay._id !== cartridgeId.slice(0, 8)) {
					throw new Error('FAILURE\n' + cartridgeId + '\nAssay ID mismatch');
				}
				if (cartridge.testId) {
					console.log('cartridge.testId', cartridge.testId);
					return getDocument(context, cartridge.testId);
				}
				else {
					console.log('creating new test');
					return createTest(context, cartridge, assay);
				}
			})
			.then(function (test) {
				var responseString;
				if (!test) {
					throw new Error('FAILURE\n' + cartridgeId + '\nTest record not found');
				}
				if (!test._id) {
					throw new Error('FAILURE\n' + cartridgeId + '\nMissing test ID');
				}
				if (test._id !== cartridge.testId) {
					throw new Error('FAILURE\n' + cartridgeId + '\nTest ID mismatch');
				}
				if (test.status !== 'In queue') {
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge has not been queued');
				}
				responseString = generateTestString(cartridgeId, assay, test._id);
				console.log('validate-cartridge', 'SUCCESS', responseString);
				send_response(context, cb, 'validate-cartridge', 'SUCCESS', responseString);
			})
			.catch(function (error) {
				console.log(error);
				if (error.message && error.message.slice(0,7) === 'FAILURE') {
					send_response(context, cb, 'validate-cartridge', 'FAILURE', error.message.slice(8));
				}
				else {
					if (error.statusCode && error.statusCode === 404) {
						send_response(context, cb, 'validate-cartridge', 'FAILURE', cartridgeId + '\n' + error.message.slice(8));
					}
					else {
						error.cartridgeId = cartridgeId;
						send_response(context, cb, 'validate-cartridge', 'ERROR', error);
					}
				}
			});
	} else {
		send_response(context, cb, 'validate-cartridge', 'FAILURE', cartridgeId + '\nCartridge ID not found');
	}
}

function start_test(context, cb, testId) {
	var cartridgeId, device;

	console.log('webtask_brevitest, test-start');
	console.log(testId);
	if (!context.data.coreid) {
		send_response(context, cb, 'test-start', 'FAILURE', testId + '\nNo device id found');
	}

	getDocument(context, context.data.coreid)
		.then(function(d) {
			if (!d) {
				throw new Error ('FAILURE\n' + testId + '\nDevice not found');
			}
			device = d;

			if (!testId) {
				throw new Error('FAILURE\n' + testId + '\nNo test id found');
			}
			return getDocument(context, testId);
		})
		.then(function(test) {
			if (!test) {
				throw new Error ('FAILURE\n' + testId + '\nTest not found');
			}
			else if (!test.cartridge) {
				throw new Error ('FAILURE\n' + testId + '\nTest cartridge not found');
			}
			else if (!test.cartridge._id) {
				throw new Error ('FAILURE\n' + testId + '\nTest cartridge ID not found');
			}

			test.device = device;
			test.status = 'In progress';
			test.percentComplete = 0;
			test.startedOn = new Date();
			cartridgeId = test.cartridge._id;
			return saveDocument(context, test);
		})
		.then(function(response) {
			console.log(response);
			if (!response || !response.ok) {
				throw new Error ('FAILURE\n' + testId + '\nTest not saved');
			}
			return getDocument(context, cartridgeId);
		})
		.then(function(cartridge) {
			if (!cartridge) {
				throw new Error ('FAILURE\n' + testId + '\nCartridge not found');
			}
			cartridge.used = true;
			return saveDocument(context, cartridge);
		})
		.then(function(response) {
			console.log(response);
			if (!response || !response.ok) {
				throw new Error ('FAILURE\n' + testId + '\nTest not saved');
			}
			send_response(context, cb, 'test-start', 'SUCCESS', testId);
		})
		.catch(function(error) {
			console.log(error);
			if (error.message && error.message.slice(0,7) === 'FAILURE') {
				send_response(context, cb, 'test-start', 'FAILURE', error.message.slice(8));
			}
			else {
				error.testId = testId;
				send_response(context, cb, 'test-start', 'ERROR', error);
			}
		});
}

function finish_test(context, cb, testId) {
	var cartridgeId;

	console.log('webtask_brevitest, test-finish');

	if (!testId) {
		send_response(context, cb, 'test-finish', 'FAILURE', 'No test id');
	}
	else {
		getDocument(context, testId)
			.then(function(test) {
				if (!test) {
					throw new Error ('FAILURE\n' + testId + '\nTest not found');
				}
				if (!test.cartridge) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge not found');
				}
				if (!test.cartridge._id) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge ID not found');
				}

				test.status = 'Awaiting results';
				test.percentComplete = 100;
				test.finishedOn = new Date();

				console.log('completed test', test);
				return saveDocument(context, test);
			})
			.then(function(response) {
				console.log(response);
				if (!response || !response.ok) {
					throw new Error ('FAILURE\n' + testId + '\nTest not saved');
				}
				send_response(context, cb, 'test-finish', 'SUCCESS', testId);
			})
			.catch(function(error) {
				console.log(error);
				if (error.message && error.message.slice(0,7) === 'FAILURE') {
					send_response(context, cb, 'test-finish', 'FAILURE', error.message.slice(8));
				}
				else {
					error.testId = testId;
					send_response(context, cb, 'test-finish', 'ERROR', error);
				}
			});
	}
}

function cancel_test(context, cb, testId) {
	var cartridgeId;

	console.log('webtask_brevitest, test-cancel');

	if (!testId) {
		send_response(context, cb, 'test-cancel', 'FAILURE', 'No test id');
	}
	else {
		getDocument(context, testId)
			.then(function(test) {
				if (!test) {
					throw new Error ('FAILURE\n' + testId + '\nTest not found');
				}
				if (!test.cartridge) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge not found');
				}
				if (!test.cartridge._id) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge ID not found');
				}

				test.status = 'Cancelled';
				test.finishedOn = new Date();

				console.log('cancelled test', test);
				return saveDocument(context, test);
			})
			.then(function(response) {
				console.log(response);
				if (!response || !response.ok) {
					throw new Error ('FAILURE\n' + testId + '\nTest not saved');
				}
				send_response(context, cb, 'test-cancel', 'SUCCESS', testId);
			})
			.catch(function(error) {
				console.log(error);
				if (error.message && error.message.slice(0,7) === 'FAILURE') {
					send_response(context, cb, 'test-cancel', 'FAILURE', error.message.slice(8));
				}
				else {
					error.testId = testId;
					send_response(context, cb, 'test-cancel', 'ERROR', error);
				}
			});
	}
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
	};
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

function calculateTestResult(test, neuralNetwork) {
	var net = Network.fromJSON(neuralNetwork.dehydratedNet);
	var duration = test.finishedOn - test.startedOn;
	var assayStart = test.rawData.readings[0];
	var controlStart = test.rawData.readings[1];
	var assayFinish = test.rawData.readings[2];
	var controlFinish = test.rawData.readings[3];
	var inputSet = [
		assayStart.red_mean / 65535,
		assayStart.green_mean / 65535,
		assayStart.blue_mean / 65535,
		assayStart.clear_mean / 65535,
		controlStart.red_mean / 65535,
		controlStart.green_mean / 65535,
		controlStart.blue_mean / 65535,
		controlStart.clear_mean / 65535,
		assayFinish.red_mean / 65535,
		assayFinish.green_mean / 65535,
		assayFinish.blue_mean / 65535,
		assayFinish.clear_mean / 65535,
		controlFinish.red_mean / 65535,
		controlFinish.green_mean / 65535,
		controlFinish.blue_mean / 65535,
		controlFinish.clear_mean / 65535,
		duration / 1200000	// 20 minute max test duration
	];

	test.reading = net.activate(inputSet);
	if (test.assay && test.assay.standardCurve && test.assay.standardCurve.cutScores) {
		if (test.reading < test.assay.standardCurve.cutScores.redMin) {
			test.result = 'Positive - Low';
		}
		else if (test.reading < test.assay.standardCurve.cutScores.greenMin) {
			test.result = 'Borderline - Low';
		}
		else if (test.reading < test.assay.standardCurve.cutScores.greenMax) {
			test.result = 'Negative';
		}
		else if (test.reading < test.assay.standardCurve.cutScores.redMax) {
			test.result = 'Borderline - High';
		}
		else {
			test.result = 'Positive - High';
		}
	}
}

function upload_test(context, cb, testId) {
	var result, test, token;
	var deviceId = context.data.coreid;

	console.log('webtask_brevitest, upload-test');

	if (!deviceId) {
		send_response(context, cb, 'test-upload', 'FAILURE', 'No device id');
	}
	else if (!testId) {
		send_response(context, cb, 'test-upload', 'FAILURE', 'No test id');
	}
	else {
		login(context)
		  .then(function(response) {
			  token = response.body.access_token;
			  return getTestData(deviceId, token);
		  })
		  .then(function(response) {
			  if (!response || !response.body || !response.body.result) {
				throw new Error('FAILURE\n' + testId + '\nUnable to get test data from device');
			  }
			  result = parseData(response.body.result, testId);
			  if (result.testId !== testId) {
				throw new Error('FAILURE\n' + testId + '\nTest ID in device does not match test ID requested');
			  }
			  delete result.testId;
			  return getDocument(context, testId);
		  })
		  .then(function(t) {
			  if (!t) {
				throw new Error('FAILURE\n' + testId + '\nTest not found');
			  }
			  if (!t.assay) {
				throw new Error('FAILURE\n' + testId + '\nAssay not found in test record');
			  }
			  if (!t.assay.neuralNetId) {
				throw new Error('FAILURE\n' + testId + '\nNeural network not found in assay record');
			  }
			  test = t;
			  test.rawData = result;
			  console.log(test);
			  return getDocument(context, test.assay.neuralNetId);
		  })
		  .then(function(neuralNetwork) {
			  if (!neuralNetwork) {
				throw new Error('FAILURE\n' + test.assay.neuralNetId + '\nNeural network not found');
			  }
			  calculateTestResult(test, neuralNetwork);
			  return saveDocument(context, test);
		  })
	  	  .then(function(response) {
			  console.log(response);
			  if (!response || !response.ok) {
				throw new Error('FAILURE\n' + testId + '\nTest not saved');
			  }
			  send_response(context, cb, 'test-upload', 'SUCCESS', testId);
		  })
		  .catch(function(error) {
			  if (error.message && error.message.slice(0,7) === 'FAILURE') {
				  send_response(context, cb, 'test-upload', 'FAILURE', error.message.slice(8));
			  }
			  else {
				  error.testId = testId;
				  send_response(context, cb, 'test-upload', 'ERROR', error);
			  }
		  });
	}
}

function createNeuralNet(context, assay, network, trainingSet) {
	console.log('Creating new neural network', assay);
	var id = 'net' + assay._id + Date.now().toString();
    var net = {
        _id: id,
        schema: 'neural-net',
		createdOn: new Date(),
        assay: assay,
		network: network,
		trainingSet: trainingSet
    };

	return saveDocument(context, net)
		.then(function(response) {
			net._rev = response.rev;
			assay.neuralNetId = id;
			return saveDocument(context, assay);
		})
		.then(function(response) {
			assay._rev = response.rev;
			return assay;
		});
}

function loadTrainingSet(context, testListString) {
  var testList = testListString.split('\n');
  console.log('testList', testList);
  return loadDocuments(context, testList)
  		.then(function(testsResponse) {
  			if (!testsResponse) {
  				throw new Error ('FAILURE\n' + data + '\nTraining tests not found');
  			}
		    trainingSet = testsResponse.rows.map(function(r) {
  				var readings;

  				if (!r.doc) {
  					throw new Error ('FAILURE\nUnknown\nDocument not found for training test');
  				}
  				var doc = r.doc;
  				console.log("doc", doc);
  				if (typeof doc.concentration === "undefined") {
  					throw new Error ('FAILURE\n' + doc._id + '\nConcentration not found in training test');
  				}
  				if (!doc.rawData) {
  					throw new Error ('FAILURE\n' + doc._id + '\nRaw data not found in training test');
  				}
  				if (!doc.rawData.readings) {
  					throw new Error ('FAILURE\n' + doc._id + '\nReadings not found in training test');
  				}
  				if (doc.rawData.readings.length !== 4) {
  					throw new Error ('FAILURE\n' + doc._id + '\nThere are not 4 readings in training test');
  				}
  				readings = doc.rawData.readings;
  				return {
						input: [
							readings[0].red_mean, readings[0].green_mean, readings[0].blue_mean, readings[0].clear_mean,
		  					readings[1].red_mean, readings[1].green_mean, readings[1].blue_mean, readings[1].clear_mean,
		  					readings[2].red_mean, readings[2].green_mean, readings[2].blue_mean, readings[2].clear_mean,
		  					readings[3].red_mean, readings[3].green_mean, readings[3].blue_mean, readings[3].clear_mean,
							(new Date(doc.finishedOn) - new Date(doc.startedOn))
						],
						output: [
							doc.concentration
						]
					};
  			});
		    console.log('trainingSet', trainingSet);
			return trainingSet;
		});
}

function train_dehydrate_and_store_network(context, cb, data) {
  	var neuralNet;

	if (!data) {
		send_response(context, cb, 'train-network', 'FAILURE', 'No data record');
	}
	else {
		getDocument(context, data)
	  		.then(function(nn) {
	  			if (!nn) {
	  				throw new Error ('FAILURE\n' + data + '\nNeural network not found');
	  			}

	  		  	neuralNet = nn;
	  			console.log('Neural network loaded', neuralNet);
	  			return loadTrainingSet(context, neuralNet.trainingTests);
	  		})
	  		.then(function(trainingSet) {
	    		// data:
	    		//		assayId
	    		//		training set:
	    		//			[
	    		//				brevitest device results (17 values)
	    		//				reference lab test results (1 value)
	    		//			]
	  			console.log('Create neural network');
	    		var net = new Architect.Perceptron(17, 9, 1);
	    		// input layer (17 inputs):
	    		//		assay:
	    		//			initial RGBC
	    		//			final RGBC
	    		//		control:
	    		//			initial RGBC
	    		//			final RGBC
	    		//		duration
	    		//

	    		// create a trainer and train the network
	  			console.log('Create trainer');
	    		var trainer = new Trainer(net);

	  			console.log('Train trainer');
	    		trainer.train(trainingSet,{
	    			rate: 0.1,
	    			iterations: 20000,
	    			error: 0.005,
	    			shuffle: true,
	    			log: 1000,
	    			cost: Trainer.cost.CROSS_ENTROPY
	    		});

	    		// activate the network once to optimize it
	    		net.activate([
	    			0.5, 0.5, 0.5, 0.5,
	    			0.5, 0.5, 0.5, 0.5,
	    			0.5, 0.5, 0.5, 0.5,
	    			0.5, 0.5, 0.5, 0.5,
	    			0.5
	    		]);

	    		// dehydrate the network by serializing it to a JSON object
	    		neuralNet.dehydratedNet = net.toJSON();
	  			console.log(neuralNet);

	    		// save dehydrated network
	    		return saveDocument(context, neuralNet);
	    	})

	  		.then(function(response) {
	  			console.log(response);
	  			if (!response || !response.ok) {
	  				throw new Error ('FAILURE\n' + data + '\nNeural network not saved');
	  			}
	  			send_response(context, cb, 'train-network', 'SUCCESS', data);
	  		})
	  		.catch(function(error) {
	  			console.log(error);
	  			if (error.message && error.message.slice(0,7) === 'FAILURE') {
	  				send_response(context, cb, 'train-network', 'FAILURE', error.message.slice(8));
	  			}
	  			else {
	  				error.neuralNetId = data;
	  				send_response(context, cb, 'train-network', 'ERROR', error);
	  			}
	  		});
	}

}

function write_log(context, event_name, event_type, data) {
	console.log('Creating new log entry', event_name);
	// var d = new Date();
	// var id = 'log_' + d.toISOString();
    // var log_entry = {
    //     _id: id,
    //     schema: 'log',
	// 	loggedOn: d,
	// 	event: event_name,
	// 	type: event_type,
    //     data: data
    // };
	//
	// return saveDocument(context, log_entry);
}

function send_response(context, cb_fcn, event_name, event_type, data) {
	var response = 	event_name + '\n' + event_type + '\n';

	if (typeof(data) === 'object') {
		response += JSON.stringify(data) + '\n';
	}
	else {
		response += data + '\n';
	}

	write_log(context, event_name, event_type, data);

	if (event_type === 'ERROR') {
		cb_fcn(response);
	}
	else {
		cb_fcn(null, response);
	}
}

module.exports =
	function (context, cb) {
		var indx = context.data.data.indexOf('\n');
		var event_name = context.data.data.slice(0, indx);
		var data = context.data.data.slice(indx + 1);

		write_log(context, event_name, 'REQUEST', data);
		switch (event_name) {
			case 'validate-cartridge':
				validate_cartridge(context, cb, data);
				break;
			case 'test-start':
				start_test(context, cb, data);
				break;
			case 'test-finish':
				finish_test(context, cb, data);
				break;
			case 'test-cancel':
				cancel_test(context, cb, data);
				break;
			case 'test-upload':
				upload_test(context, cb, data);
				break;
			case 'train-network':
				train_dehydrate_and_store_network(context, cb, data);
				break;
			default:
				send_response(context, cb, event_name, 'FAILURE', 'Event not found\n' + data);
		}

	};
